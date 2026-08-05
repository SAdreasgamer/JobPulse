from app.core.db import Conn
from app.core.enums import Event as EventType
from app.meta.repository import MetaRepository
from app.meta.schemas import MetaKey, MetaVocabulary

# Per key, keep a small sample of the most recent distinct values for reuse.
_VALUE_SAMPLE = 8

# json_each `type` names → the coarse type the suggest UI reasons about.
_TYPE_MAP = {"true": "boolean", "false": "boolean", "integer": "integer", "real": "real"}


def _norm_type(json_type: str) -> str:
    return _TYPE_MAP.get(json_type, "text")


def _value_str(value: object, json_type: str) -> str:
    if json_type in ("true", "false"):
        return json_type  # json_each hands booleans back as 1/0; keep the word
    return str(value)


class MetaService:
    def __init__(self, conn: Conn) -> None:
        self.repo = MetaRepository(conn)

    def vocabulary(self, entity: str) -> MetaVocabulary:
        table_col = self.repo.entity_table(entity)
        if table_col is None:
            return MetaVocabulary(entity=entity, keys=[])
        table, column = table_col
        rows = self.repo.meta_values(table, column)

        uses: dict[str, int] = {}
        values: dict[str, list[str]] = {}
        types: dict[str, set[str]] = {}
        for row in rows:
            key = row["key"]
            uses[key] = uses.get(key, 0) + 1
            types.setdefault(key, set()).add(_norm_type(row["type"]))
            bucket = values.setdefault(key, [])
            v = _value_str(row["value"], row["type"])
            if v not in bucket and len(bucket) < _VALUE_SAMPLE:
                bucket.append(v)

        keys = [
            MetaKey(
                key=key,
                uses=count,
                values=values.get(key, []),
                type=next(iter(types[key])) if len(types[key]) == 1 else "mixed",
            )
            for key, count in sorted(uses.items(), key=lambda kv: (-kv[1], kv[0]))
        ]
        return MetaVocabulary(entity=entity, keys=keys)

    def note_titles(self) -> list[str]:
        """Distinct titles used on note events across all jobs, most-used first —
        the suggestion pool for a new note's title, so recurring headings ("Phone
        screen", "Follow-up") stay consistent instead of drifting."""
        rows = self.repo.note_titles(EventType.NOTE.value)
        return [row["title"] for row in rows]
