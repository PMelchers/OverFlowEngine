"""Evaluates an If-block's structured condition list against saved variables.

Each condition is {variable, operator, value, combinator}. Conditions are
combined left to right with no operator precedence: the first condition sets
the running result, each following one applies its own combinator ("and" /
"or") against the running result and its own comparison.
"""

import operator

_OPERATORS = {
    "==": operator.eq,
    "!=": operator.ne,
    ">": operator.gt,
    ">=": operator.ge,
    "<": operator.lt,
    "<=": operator.le,
}


def _coerce_like(reference, raw: str | None):
    """Coerce a raw string value to the same type as `reference` (bool/int/string)."""
    if isinstance(reference, bool):
        return str(raw).strip().lower() == "true"
    if isinstance(reference, int):
        try:
            return int(raw)
        except (TypeError, ValueError):
            return 0
    return "" if raw is None else str(raw)


def _describe(cond: dict) -> str:
    return f'{cond.get("variable", "")} {cond.get("operator", "==")} {cond.get("value", "")}'


def evaluate_conditions(conditions: list[dict], variables: dict) -> tuple[bool, str]:
    if not conditions:
        return False, "no conditions configured"

    result = None
    parts: list[str] = []
    for i, cond in enumerate(conditions):
        var_name = cond.get("variable", "")
        op_func = _OPERATORS.get(cond.get("operator", "=="), operator.eq)
        left = variables.get(var_name)
        right = _coerce_like(left, cond.get("value", ""))
        try:
            clause_result = op_func(left, right) if left is not None else False
        except TypeError:
            clause_result = False

        clause_text = _describe(cond)
        if i == 0:
            result = clause_result
            parts.append(clause_text)
        else:
            combinator = cond.get("combinator", "and")
            result = (result or clause_result) if combinator == "or" else (result and clause_result)
            parts.append(f'{combinator.upper()} {clause_text}')

    return bool(result), " ".join(parts)
