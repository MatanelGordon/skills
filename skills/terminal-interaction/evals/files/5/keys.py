"""Key handling for the server list. Pure functions: nothing here touches the terminal."""
from dataclasses import dataclass, replace


@dataclass(frozen=True)
class ListState:
    count: int
    cursor: int = 0
    selected: int | None = None
    should_quit: bool = False


def handle_key(state, key):
    """Return the state after one key press. A key that is not a shortcut changes nothing."""
    last = max(state.count - 1, 0)
    if key == "j":
        return replace(state, cursor=min(state.cursor + 1, last))
    if key == "k":
        return replace(state, cursor=max(state.cursor - 1, 0))
    if key == "g":
        return replace(state, cursor=0)
    if key == "G":
        return replace(state, cursor=last)
    if key == "enter":
        return replace(state, selected=state.cursor)
    if key == "q":
        return replace(state, should_quit=True)
    return state
