"""Wiring, and the two places the home feed is served from."""
from feed.db import connect
from feed.service import FeedService
from feed.store import PostStore

service = FeedService(PostStore(connect()))


def get_feed(request):
    """GET /feed - the home screen of the app."""
    return {"posts": [post.id for post in service.home_feed(request.user_id)]}


def build_digest(user_id: str) -> list[str]:
    """Nightly email digest job."""
    return [post.id for post in service.home_feed(user_id)][:5]
