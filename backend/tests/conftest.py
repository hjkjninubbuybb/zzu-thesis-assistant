"""Shared test configuration and helpers."""

import pytest


def pytest_collection_modifyitems(items):
    """Auto-mark tests under tests/storage/ as 'integration'."""
    for item in items:
        if "/storage/" in str(item.path):
            item.add_marker(pytest.mark.integration)
