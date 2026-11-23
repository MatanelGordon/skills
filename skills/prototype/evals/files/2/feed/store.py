"""Posts as the feed service sees them."""
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Post:
    id: str
    author_id: str
    created_at: datetime
    hidden: bool = False
    # Likes, comments and shares are NOT stored here. They live in the
    # analytics warehouse, which this service has no client for.


class PostStore:
    def __init__(self, db):
        self.db = db

    def posts_from_followed(self, user_id: str) -> list[Post]:
        rows = self.db.query(
            "SELECT p.id, p.author_id, p.created_at, p.hidden FROM posts p "
            "JOIN follows f ON f.followee_id = p.author_id "
            "WHERE f.follower_id = %s AND p.created_at > now() - interval '7 days'",
            (user_id,),
        )
        return [Post(*row) for row in rows]
