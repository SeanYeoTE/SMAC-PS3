"""Live monitoring API tests. They need the organisers' dataset folder:

    PS3_DATA=/path/to/02_Datasets pytest tests/
"""
import io
import os
import time

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from ps3 import door, rail, acv

DATA = os.environ.get("PS3_DATA", "")
pytestmark = pytest.mark.skipif(not os.path.isdir(DATA), reason="set PS3_DATA to the 02_Datasets folder")
client = TestClient(app)


def _wait(sid, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = client.get(f"/api/live/sessions/{sid}").json()
        if st["status"] in ("replay finished", "stopped") or st["status"].startswith("replay failed"):
            return st
        time.sleep(0.2)
    raise AssertionError("replay did not finish")


def test_door_sensor_chunks_match_batch():
    f = f"{DATA}/Door/Test.csv"
    sid = client.post("/api/live/door/sessions").json()["session_id"]
    df = pd.read_csv(f)
    for a in range(0, len(df), 500):                       # sensor sends 500-row CSV chunks
        buf = io.StringIO(); df.iloc[a:a + 500].to_csv(buf, index=False)
        r = client.post(f"/api/live/sessions/{sid}/data", content=buf.getvalue(),
                        headers={"content-type": "text/csv"})
        assert r.status_code == 200, r.text
    st = client.post(f"/api/live/sessions/{sid}/stop").json()
    assert st["cycles"] == 38 and st["alerts"] == 8
    alerts = [e for e in client.get(f"/api/live/sessions/{sid}/events").json()["events"] if e["kind"] == "alert"]
    batch = door.predict(f)["segments"]
    assert sorted(e["values"]["start_time"] for e in alerts) == \
        sorted(batch.loc[batch.prediction != "Normal", "start_time"])
    assert all(e["urgency"]["times_threshold"] >= 1 for e in alerts)


def test_rail_replay_matches_batch():
    files = [f"{DATA}/Rail_Corrugation/Test/Test9.csv", f"{DATA}/Rail_Corrugation/Test/Test1.csv"]
    sid = client.post("/api/live/rail/sessions").json()["session_id"]
    up = [("files", (os.path.basename(f), open(f, "rb"), "text/csv")) for f in files]
    assert client.post(f"/api/live/sessions/{sid}/replay", files=up, data={"speed": "1000"}).status_code == 200
    assert _wait(sid)["windows"] == 2
    ev = client.get(f"/api/live/sessions/{sid}/events", params={"after": 0}).json()["events"]
    assert [e["values"]["prediction"] for e in ev] == [rail.predict(f)["prediction"] for f in files]


def test_replay_files_uploaded_one_per_request():
    """Cloud Run rejects any request over 32 MB and one Rail file is ~17.5 MB, so
    the page uploads each file in its own request, then starts the replay."""
    files = [f"{DATA}/Rail_Corrugation/Test/Test9.csv", f"{DATA}/Rail_Corrugation/Test/Test1.csv"]
    sid = client.post("/api/live/rail/sessions").json()["session_id"]
    for i, f in enumerate(files, 1):
        r = client.post(f"/api/live/sessions/{sid}/files",
                        files={"file": (os.path.basename(f), open(f, "rb"), "text/csv")})
        assert r.status_code == 200, r.text
        assert r.json()["pending"] == i
    r = client.post(f"/api/live/sessions/{sid}/replay", data={"speed": "1000"})
    assert r.status_code == 200, r.text
    assert r.json()["files"] == 2
    assert _wait(sid)["windows"] == 2
    ev = client.get(f"/api/live/sessions/{sid}/events", params={"after": 0}).json()["events"]
    assert [e["values"]["prediction"] for e in ev] == [rail.predict(f)["prediction"] for f in files]


def test_replay_needs_files_and_runs_once_at_a_time():
    f = f"{DATA}/Door/Test.csv"
    sid = client.post("/api/live/door/sessions").json()["session_id"]
    assert client.post(f"/api/live/sessions/{sid}/replay", data={"speed": "1"}).status_code == 400
    bad = {"file": ("x.xlsx", b"nope", "application/octet-stream")}
    assert client.post(f"/api/live/sessions/{sid}/files", files=bad).status_code == 400
    up = lambda: [("files", ("Test.csv", open(f, "rb"), "text/csv"))]
    assert client.post(f"/api/live/sessions/{sid}/replay", files=up(), data={"speed": "1"}).status_code == 200
    assert client.post(f"/api/live/sessions/{sid}/replay", files=up(), data={"speed": "1"}).status_code == 409
    assert client.post(f"/api/live/sessions/{sid}/stop").json()["status"] == "stopped"


def test_shm_json_values_and_segment_close():
    from ps3 import shm
    x = shm.load_series(f"{DATA}/SHM/Test/test02.csv")
    sid = client.post("/api/live/shm/sessions").json()["session_id"]
    half = len(x) // 2
    r = client.post(f"/api/live/sessions/{sid}/data", json={"values": x[:half].tolist()})
    assert r.status_code == 200 and r.json()["state"]["current_segment_progress"] == pytest.approx(0.5, abs=0.01)
    client.post(f"/api/live/sessions/{sid}/data", json={"values": x[half:].tolist()})
    st = client.get(f"/api/live/sessions/{sid}").json()
    assert st["segment_damages"] == [shm.predict(x)["prediction"]]
    assert st["alerts"] == 1                                # passed 50% of the limit (D = 0.82)


def test_acv_replay_final_ranking_matches_batch():
    f = f"{DATA}/ACV/Test/acv_test_case.xlsx"
    sid = client.post("/api/live/acv/sessions").json()["session_id"]
    up = [("files", ("acv_test_case.xlsx", open(f, "rb"), "application/octet-stream"))]
    client.post(f"/api/live/sessions/{sid}/replay", files=up, data={"speed": "1e9"})
    st = _wait(sid)
    assert st["leading"]["ranked_cars"] == acv.predict(f)["ranked_cars"]
    assert st["alerted_car"] == "01"


def test_errors():
    assert client.get("/api/live/sessions/nope").status_code == 404
    assert client.post("/api/live/nope/sessions").status_code == 404
    sid = client.post("/api/live/door/sessions").json()["session_id"]
    assert client.post(f"/api/live/sessions/{sid}/data", content=b"not,a,door\n1,2,3",
                       headers={"content-type": "text/csv"}).status_code == 422
    up = [("files", ("x.xlsx", b"nope", "application/octet-stream"))]
    assert client.post(f"/api/live/sessions/{sid}/replay", files=up).status_code == 400
    assert client.delete(f"/api/live/sessions/{sid}").status_code == 200
    assert client.get(f"/api/live/sessions/{sid}").status_code == 404
