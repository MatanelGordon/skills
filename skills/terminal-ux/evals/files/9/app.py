from textual.app import App, ComposeResult
from textual.widgets import DataTable, Footer, Header


def load_rows() -> list[tuple[str, str, int]]:
    """Stand-in for the real query: service, region, p99 in ms."""
    return [
        ("checkout", "eu-west", 182),
        ("search", "us-east", 45),
        ("billing", "ap-tokyo", 97),
    ]


class ServicesApp(App):
    """Shows service latency in a table."""

    BINDINGS = [("q", "quit", "Quit")]

    def compose(self) -> ComposeResult:
        yield Header()
        yield DataTable()
        yield Footer()

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.add_columns("Service", "Region", "p99 ms")
        for row in load_rows():
            table.add_row(*row)


if __name__ == "__main__":
    ServicesApp().run()
