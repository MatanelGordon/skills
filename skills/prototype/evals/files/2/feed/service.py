"""Builds the home feed. This is the main production path: about 40M calls a day."""
from feed.store import Post, PostStore

FEED_SIZE = 20


class FeedService:
    def __init__(self, store: PostStore):
        self.store = store

    def home_feed(self, user_id: str) -> list[Post]:
        posts = self.store.posts_from_followed(user_id)
        visible = [post for post in posts if not post.hidden]
        visible.sort(key=lambda post: post.created_at, reverse=True)  # newest first
        return visible[:FEED_SIZE]
