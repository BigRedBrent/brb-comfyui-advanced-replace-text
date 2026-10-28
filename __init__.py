import re

WEB_DIRECTORY = "."

LOG_PREFIX = "[Advanced Replace Text]"

# How many find and replace pairs the node can have. The page shows only the ones in use, plus one empty pair.
PAIRS = 100

# Tokens are written between percent signs, the same as in ComfyUI's Save Image and Primitive nodes.
TOKEN = re.compile(r"%([^%]+)%")

# The date codes ComfyUI understands in %date:...%: yy or yyyy for the year, then M, d, h, m and s for the month,
# day, hour (24-hour clock), minute and second. Doubling a letter, like MM, adds a leading zero. This node also
# understands f, ff and fff for tenths, hundredths and thousandths (milliseconds) of a second, like .NET does.
DATE_CODE = re.compile(r"dd?|MM?|hh?|mm?|ss?|yyy?y?|f{1,3}")


class AnyType(str):
    # A type that matches every other type, so any wire can be connected.
    def __ne__(self, other):
        return False


ANY = AnyType("*")


def format_date(codes, now):
    # Works exactly like ComfyUI's own %date:...% so the results match.
    parts = {"d": now.day, "M": now.month, "h": now.hour, "m": now.minute, "s": now.second}

    def fill(match):
        code = match.group(0)
        if code == "yy":
            return str(now.year)[2:]
        if code == "yyyy":
            return str(now.year)
        if code[0] == "f":
            return str(now.microsecond // 10 ** (6 - len(code))).zfill(len(code))
        if code[0] in parts:
            return str(parts[code[0]]).zfill(len(code))
        return code

    return DATE_CODE.sub(fill, codes)


def fill_dates(text, now):
    # Fills in every %date:...% with the time the node runs. Other tokens are left as they are. (Tokens for other
    # nodes' settings, like %KSampler.seed%, are filled in by the page when you click Run, like the Primitive does.)
    def fill(match):
        # Unlike ComfyUI's own, a date may contain a dot, like %date:ss.fff%, since milliseconds come after one.
        token = match.group(1)
        if token.startswith("date:"):
            return format_date(token[len("date:"):], now)
        return match.group(0)

    return TOKEN.sub(fill, text)


def has_date(text):
    return isinstance(text, str) and "%date:" in text


def to_text(value):
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    return str(value)


class AdvancedReplaceText:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {
            "passthrough": (
                ANY,
                {
                    "tooltip": "Any value, sent out unchanged. This node waits for it, so wire it from what has to "
                    "finish first, like the images going to your saver, to take the time right before saving.",
                },
            ),
        }
        for number in range(1, PAIRS + 1):
            optional[f"find_{number}"] = (
                "STRING",
                {
                    "multiline": False,
                    "default": "",
                    "tooltip": "Text to find, exactly as typed: tokens aren't filled in here. Every place it's found "
                    "is changed to the replace below it. Pairs are done in order, after the tokens are filled in.",
                },
            )
            optional[f"replace_{number}"] = (
                "STRING",
                {
                    "multiline": False,
                    "default": "",
                    "tooltip": "What to put in place of the find above it. Leave it empty to remove what's found.",
                },
            )
        return {
            "required": {
                "text": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "tooltip": "The text to change. Type it here, or wire it in from another node.",
                    },
                ),
                "replace_tokens": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "Fills in tokens the same way ComfyUI's Primitive does: %date:yyyy-MM-dd_hh-mm-ss% "
                        "with the time this node runs, and %Title.setting%, like %KSampler.seed%, with that node's "
                        "setting. Works in the replace boxes too, but not the find boxes, which are always taken as typed.",
                    },
                ),
                "use_regex": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "Treats each find as a regular expression (Python's), so one find can match many "
                        "different texts. In a replace, \\1 or \\g<1> puts back what the first group in "
                        "parentheses matched. A find that isn't a valid regular expression is skipped.",
                    },
                ),
            },
            "optional": optional,
        }

    RETURN_TYPES = (ANY, "STRING")
    RETURN_NAMES = ("passthrough", "text")
    FUNCTION = "replace"
    CATEGORY = "text"
    DESCRIPTION = "Tokens, regular expressions (regex), multiple replacements, passthrough"

    @classmethod
    def IS_CHANGED(cls, replace_tokens=True, **inputs):
        # With a date to fill in, run every time, so the time is always new. Text wired in from another node isn't
        # known yet at this point, so it's run every time as well, in case that text has a date in it.
        if not replace_tokens:
            return ""
        values = [value for name, value in inputs.items() if not name.startswith("find_")]
        if "text" not in inputs or any(has_date(value) for value in values):
            return float("nan")
        return ""

    def replace(self, text, replace_tokens, use_regex=False, passthrough=None, **pairs):
        import datetime

        now = datetime.datetime.now()

        def prepare(value):
            value = to_text(value)
            return fill_dates(value, now) if replace_tokens else value

        text = prepare(text)
        for number in range(1, PAIRS + 1):
            # Finds are taken exactly as typed, without filling in tokens.
            find = to_text(pairs.get(f"find_{number}"))
            if not find:
                continue
            replace = prepare(pairs.get(f"replace_{number}"))
            if not use_regex:
                text = text.replace(find, replace)
                continue
            try:
                text = re.sub(find, replace, text)
            except (re.error, IndexError) as error:
                # The error isn't included, since it can quote part of the find box.
                print(f"{LOG_PREFIX} Skipped find_{number}, since it isn't a valid regular expression")
        return (passthrough, text)


NODE_CLASS_MAPPINGS = {
    "BRBAdvancedReplaceText": AdvancedReplaceText,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BRBAdvancedReplaceText": "Advanced Replace Text",
}

__all__ = ["WEB_DIRECTORY", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
