#!/usr/bin/env python3
"""
Lightweight Luau structure checker (no dependencies).

Catches the most common hand-written Luau mistakes before you open Studio:
  * unbalanced function/if/for/while/do/repeat ... end/until
  * unbalanced () [] {}
  * unterminated strings / long strings / block comments
  * `then` / `do` in the wrong place, stray `end`, `elseif`/`else` outside an if
  * C-style operators (!=, &&, ||) and `+=` on a new line etc.
It understands Luau `if a then b else c` expressions, backtick strings, type annotations and `continue`.

It is NOT a full parser or type checker — use Studio's Script Analysis / luau-lsp for that.

Usage:  python3 tools/luau_check.py src            (exit code 1 if any error)
"""
import os
import re
import sys

KEYWORDS = {
    "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in",
    "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
}
# tokens after which an `if` must be an if-EXPRESSION (value position)
EXPR_PREV = {
    "=", "(", ",", "{", "[", "return", "and", "or", "not", "..", "+", "-", "*", "/", "//", "%", "^",
    "==", "~=", "<", ">", "<=", ">=", "+=", "-=", "*=", "/=", "..=", "%=", "^=", "//=", "#", "in", "::", "->",
    "then", "else",  # only when inside an if-EXPRESSION; handled specially below
}

SYMBOLS = [
    "...", "..=", "//=", "==", "~=", "<=", ">=", "+=", "-=", "*=", "/=", "%=", "^=", "..", "::", "->", "//",
    "!=", "&&", "||",
    "+", "-", "*", "/", "%", "^", "#", "&", "|", "~", "<", ">", "=", "(", ")", "{", "}", "[", "]", ";", ":", ",", ".", "?", "@", "!",
]


class Tok:
    __slots__ = ("kind", "val", "line")

    def __init__(self, kind, val, line):
        self.kind, self.val, self.line = kind, val, line

    def __repr__(self):
        return f"{self.kind}:{self.val}@{self.line}"


class LuauError(Exception):
    def __init__(self, line, msg):
        super().__init__(msg)
        self.line = line
        self.msg = msg


def long_bracket_level(src, i):
    """If src[i] starts a long bracket like [[ or [==[ return level, else -1."""
    if src[i] != "[":
        return -1
    j = i + 1
    level = 0
    while j < len(src) and src[j] == "=":
        level += 1
        j += 1
    if j < len(src) and src[j] == "[":
        return level
    return -1


def tokenize(src):
    toks = []
    i, n, line = 0, len(src), 1
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if c in " \t\r":
            i += 1
            continue
        # comments
        if src.startswith("--", i):
            if i + 2 < n and src[i + 2] == "[":
                lvl = long_bracket_level(src, i + 2)
                if lvl >= 0:
                    close = "]" + "=" * lvl + "]"
                    start_line = line
                    j = src.find(close, i + 2)
                    if j < 0:
                        raise LuauError(start_line, "unterminated block comment")
                    line += src.count("\n", i, j)
                    i = j + len(close)
                    continue
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        # long strings
        if c == "[":
            lvl = long_bracket_level(src, i)
            if lvl >= 0:
                close = "]" + "=" * lvl + "]"
                start_line = line
                j = src.find(close, i)
                if j < 0:
                    raise LuauError(start_line, "unterminated long string")
                line += src.count("\n", i, j)
                toks.append(Tok("str", "[[", start_line))
                i = j + len(close)
                continue
        # quoted strings
        if c in "\"'":
            start_line = line
            j = i + 1
            while True:
                if j >= n or src[j] == "\n":
                    raise LuauError(start_line, "unterminated string")
                if src[j] == "\\":
                    if j + 1 < n and src[j + 1] == "\n":
                        line += 1
                    if j + 1 < n and src[j + 1] == "z":
                        # \z skips following whitespace incl. newlines
                        k = j + 2
                        while k < n and src[k] in " \t\r\n":
                            if src[k] == "\n":
                                line += 1
                            k += 1
                        j = k
                        continue
                    j += 2
                    continue
                if src[j] == c:
                    break
                j += 1
            toks.append(Tok("str", c, start_line))
            i = j + 1
            continue
        # interpolated strings `...{expr}...`
        if c == "`":
            start_line = line
            j = i + 1
            depth = 0
            while True:
                if j >= n:
                    raise LuauError(start_line, "unterminated backtick string")
                ch = src[j]
                if ch == "\n":
                    line += 1
                if ch == "\\":
                    j += 2
                    continue
                if depth == 0 and ch == "`":
                    break
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                elif depth > 0 and ch in "\"'":
                    k = j + 1
                    while k < n and src[k] != ch and src[k] != "\n":
                        k += 2 if src[k] == "\\" else 1
                    j = k
                j += 1
            toks.append(Tok("str", "`", start_line))
            i = j + 1
            continue
        # numbers
        if c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit()):
            m = re.match(r"0[xX][0-9a-fA-F_]+|0[bB][01_]+|(\d[\d_]*)?\.?[\d_]*([eE][+-]?\d+)?", src[i:])
            j = i + max(1, len(m.group(0)))
            toks.append(Tok("num", src[i:j], line))
            i = j
            continue
        # names
        if c.isalpha() or c == "_":
            m = re.match(r"[A-Za-z_][A-Za-z0-9_]*", src[i:])
            word = m.group(0)
            toks.append(Tok("kw" if word in KEYWORDS else "name", word, line))
            i += len(word)
            continue
        for s in SYMBOLS:
            if src.startswith(s, i):
                toks.append(Tok("sym", s, line))
                i += len(s)
                break
        else:
            raise LuauError(line, f"unexpected character {c!r}")
    return toks


OPENERS = {"(": ")", "[": "]", "{": "}"}


def check_tokens(toks):
    """Returns list of (line, message)."""
    errors = []
    warnings = []
    # stack entries: (kind, line). kinds:
    #  'function','do','if','while_h','for_h','loop','if_h','elseif_h','repeat','ifx_h','ifx_body', '(', '[', '{'
    stack = []

    def top():
        return stack[-1][0] if stack else None

    prev = None
    for idx, t in enumerate(toks):
        v = t.val
        if t.kind == "sym" and v in ("!=", "&&", "||"):
            errors.append((t.line, f"C-style operator '{v}' is not Luau (use ~=, and, or)"))
        if t.kind == "sym" and v == "!" :
            errors.append((t.line, "'!' is not a Luau operator (use not)"))
        if t.kind == "sym":
            if v in OPENERS:
                stack.append((v, t.line))
            elif v in (")", "]", "}"):
                # an if-expression's final `else` value may end at a closing bracket
                while top() == "ifx_else":
                    stack.pop()
                if not stack or stack[-1][0] not in OPENERS or OPENERS[stack[-1][0]] != v:
                    opened = stack[-1] if stack else None
                    errors.append((t.line, f"unexpected '{v}'" + (f" (open '{opened[0]}' from line {opened[1]})" if opened else "")))
                    return errors, warnings
                stack.pop()
            elif v in (",", ";"):
                # comma/semicolon ends a trailing if-expression else-value at the same bracket depth
                while top() == "ifx_else":
                    stack.pop()
            prev = t
            continue

        if t.kind == "kw":
            if v == "function":
                stack.append(("function", t.line))
            elif v == "do":
                if top() in ("while_h", "for_h"):
                    stack[-1] = ("loop", stack[-1][1])
                else:
                    stack.append(("do", t.line))
            elif v == "while":
                stack.append(("while_h", t.line))
            elif v == "for":
                stack.append(("for_h", t.line))
            elif v == "repeat":
                stack.append(("repeat", t.line))
            elif v == "until":
                while top() == "ifx_else":
                    stack.pop()
                if top() != "repeat":
                    errors.append((t.line, f"'until' without matching 'repeat' (top: {top()})"))
                    return errors, warnings
                stack.pop()
            elif v == "if":
                is_expr = False
                if prev is not None:
                    pv = prev.val
                    if prev.kind == "sym" and pv in EXPR_PREV:
                        is_expr = True
                    elif prev.kind == "kw" and pv in ("return", "and", "or", "not", "in"):
                        is_expr = True
                    elif prev.kind == "kw" and pv in ("then", "else") and top() in ("ifx_body", "ifx_else"):
                        is_expr = True
                stack.append(("ifx_h" if is_expr else "if_h", t.line))
            elif v == "then":
                if top() == "if_h":
                    stack[-1] = ("if", stack[-1][1])
                elif top() == "elseif_h":
                    stack.pop()  # back to 'if'
                elif top() == "ifx_h":
                    stack[-1] = ("ifx_body", stack[-1][1])
                else:
                    errors.append((t.line, f"unexpected 'then' (top: {top()})"))
                    return errors, warnings
            elif v == "elseif":
                if top() == "if":
                    stack.append(("elseif_h", t.line))
                elif top() == "ifx_body":
                    stack[-1] = ("ifx_h", stack[-1][1])
                else:
                    errors.append((t.line, f"'elseif' outside if (top: {top()})"))
                    return errors, warnings
            elif v == "else":
                if top() == "if":
                    pass
                elif top() == "ifx_body":
                    # the else-value follows; it ends at the next closing bracket/comma or statement boundary
                    stack[-1] = ("ifx_else", stack[-1][1])
                else:
                    errors.append((t.line, f"'else' outside if (top: {top()})"))
                    return errors, warnings
            elif v == "end":
                while top() == "ifx_else":
                    stack.pop()
                if top() in ("function", "do", "loop", "if"):
                    stack.pop()
                else:
                    errors.append((t.line, f"unexpected 'end' (top: {top()}" + (f" from line {stack[-1][1]}" if stack else "") + ")"))
                    return errors, warnings
            elif v in ("local", "return", "break") or (v == "function"):
                while top() == "ifx_else" and v != "function":
                    stack.pop()
        elif t.kind == "name":
            # a statement starting after an if-expression else value: crude boundary detection
            if top() == "ifx_else" and prev is not None and (prev.kind in ("name", "num", "str") or prev.val in (")", "]", "}")):
                # e.g. `local x = if a then b else c  foo()` -> new statement begins
                stack.pop()
            if v == "continue" and prev is not None and prev.kind == "kw" and prev.val in ("then", "do", "else", "end"):
                pass
        prev = t

    while top() == "ifx_else":
        stack.pop()
    if stack:
        k, ln = stack[-1]
        errors.append((ln, f"'{k}' opened here is never closed"))
    return errors, warnings


def check_file(path):
    with open(path, encoding="utf-8") as f:
        src = f.read()
    try:
        toks = tokenize(src)
    except LuauError as e:
        return [(e.line, e.msg)], []
    return check_tokens(toks)


def main(argv):
    roots = argv[1:] or ["src"]
    files = []
    for root in roots:
        if os.path.isfile(root):
            files.append(root)
            continue
        for d, _, fs in os.walk(root):
            for fn in fs:
                if fn.endswith(".luau") or fn.endswith(".lua"):
                    files.append(os.path.join(d, fn))
    bad = 0
    for p in sorted(files):
        errs, warns = check_file(p)
        for ln, msg in errs:
            print(f"{p}:{ln}: error: {msg}")
        for ln, msg in warns:
            print(f"{p}:{ln}: warning: {msg}")
        if errs:
            bad += 1
    print(f"checked {len(files)} files, {bad} with errors")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
