"""Self-contained tests for recorded sensor timeline playback."""
import pandas as pd

from ps3 import live


def _door_rows():
    rows = []
    for cycle in range(6):
        current = 200 if cycle == 5 else 100
        for millis in (0, 100):
            rows.append({
                "Datetime": f"2026-1-1-0-0-{cycle * 2}-{millis}",
                "Motor current(mA)": current,
                "Door is closing": 0,
            })
    return rows


def test_excel_recording_becomes_scrubbable_timeline(tmp_path):
    recording = tmp_path / "door-recording.xlsx"
    pd.DataFrame(_door_rows()).to_excel(recording, index=False)

    result = live.simulate_file("door", str(recording))

    assert result["subsystem"] == "door"
    assert len(result["points"]) == 6
    assert result["points"][0]["progress"] == 0
    assert result["points"][-1]["progress"] == 1
    alerts = [event for point in result["points"] for event in point["events"]
              if event["kind"] == "alert"]
    assert len(alerts) == 1
    assert "abnormal resistance" in alerts[0]["title"]
    assert result["summary"]["final_state"]["abnormal_cycles"] == 1


def test_long_timeline_keeps_alert_points(tmp_path):
    recording = tmp_path / "door-recording.csv"
    pd.DataFrame(_door_rows()).to_csv(recording, index=False)

    result = live.simulate_file("door", str(recording), max_points=2)

    assert any(event["kind"] == "alert" for point in result["points"] for event in point["events"])
