"""Identifier generation. Both `job_id` and `listing_id` are opaque UUIDs.

`listing_id` is a surrogate primary key for a `listings` row: it carries no meaning
and is never parsed or reconstructed. A listing's real identity is the natural key
`(platform, platform_id)`, kept `UNIQUE` by the schema and resolved against by
every upsert and lookup, so two distinct natural keys can never collide at
`listings.id` and a new adapter needs no server-side registration to mint one.
Rows created under the older readable `PREFIX-platform_id` scheme keep their ids
and stay addressable, since nothing derives an id from the natural key after
creation. Human-readable render keys are a separate, adapter-side concern.
"""

import uuid


def new_job_id() -> str:
    return uuid.uuid4().hex


def new_listing_id() -> str:
    return uuid.uuid4().hex
