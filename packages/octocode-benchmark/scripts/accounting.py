"""Sums shared by the matrix summary and the dashboard datasets."""
from __future__ import annotations


def complete_sum(rows, key):
    """Sum `key` over `rows`, or None when there are no rows or any row lacks it: a partial sum would pass for a total."""
    values = [r.get(key) for r in rows]
    return sum(values) if values and all(v is not None for v in values) else None
