# Advanced Replace Text

A ComfyUI node that fills in tokens and finds and replaces text. It works like ComfyUI's Primitive with "Run widget replace on values" turned on, but with a switch on the node, a date that's filled in when the node runs instead of when you click Run, find and replace pairs that grow as you use them, and a passthrough, so the date can be taken right before your file is saved.

## Inputs

- **text:** the text to change. Type it in the box, or wire it in from another node.
- **replace_tokens:** fills in tokens, the same ones ComfyUI's Save Image and Primitive use:
  - `%date:yyyy-MM-dd_hh-mm-ss%` is filled in with the date and time this node runs. `yyyy` or `yy` is the year, `MM` the month, `dd` the day, `hh` the hour (24-hour clock), `mm` the minute and `ss` the second. With a single letter, like `M`, there's no leading zero. This node also understands `fff` for milliseconds, `ff` for hundredths and `f` for tenths of a second, which ComfyUI's own tokens don't have.
  - `%Title.setting%`, like `%KSampler.seed%`, is filled in with that node's setting when you click Run. The node is found by its title, including nodes inside subgraphs and the outside of a subgraph. This only works for text typed into this node, not text wired in.
- **use_regex:** off by default. Turn it on to treat each find as a regular expression (Python's), so one find can match many different texts. In a replace, `\1` or `\g<1>` puts back what the first group in parentheses matched. A find that isn't a valid regular expression is skipped.
- **find_1, replace_1, and so on:** find and replace pairs, done in order after the tokens are filled in. Every place the find is found is changed to its replace, and an empty replace removes what's found. Each box can be typed in or wired into. Tokens work in the replace boxes, but find boxes are always taken exactly as typed. The node always shows one empty pair at the end: filling it in adds another, and empty pairs at the end are hidden again, up to 100 pairs.
- **passthrough:** any value, sent out unchanged through the **passthrough** output. The node waits for it, so wire the images going to your saver through it, and the date is taken right before saving.

## Outputs

- **passthrough:** whatever came in through **passthrough**.
- **text:** the finished text.
