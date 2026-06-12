import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.routes import _parse_reader_csv


def test_parse_reader_csv_long_format():
    parsed = _parse_reader_csv("well,od\nA1,0.052\nA2,0.061\nH12,1.210\n")

    assert parsed == {"A1": 0.052, "A2": 0.061, "H12": 1.210}


def test_parse_reader_csv_matrix_format():
    csv_text = "\n".join([
        ",1,2,3,4,5,6,7,8,9,10,11,12",
        "A,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2",
        "B,0.11,0.21,0.31,0.41,0.51,0.61,0.71,0.81,0.91,1.01,1.11,1.21",
    ])

    parsed = _parse_reader_csv(csv_text)

    assert parsed["A1"] == 0.1
    assert parsed["A12"] == 1.2
    assert parsed["B1"] == 0.11
    assert parsed["B12"] == 1.21


def test_parse_reader_csv_vendor_adjacent_pairs():
    parsed = _parse_reader_csv("metadata,line\nResult,A1,0.5,A2,0.6\n")

    assert parsed["A1"] == 0.5
    assert parsed["A2"] == 0.6
