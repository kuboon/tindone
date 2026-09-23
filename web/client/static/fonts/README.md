# fonts

What the tasks' social cards (`server/og.ts`) are drawn with. resvg is handed all three and falls
back through them per glyph, so a Japanese title is Noto Sans JP and the Latin around it is still
Inter.

They sit under `static/` because a Worker has no file system: on Cloudflare the card renderer
fetches them from the Static Assets binding, in development it reads them from disk. No page links
them.

| File                     | Covers                               | Licence                                                        |
| ------------------------ | ------------------------------------ | -------------------------------------------------------------- |
| `Inter-Regular.ttf`      | Latin, and most of the rest          | [`LICENSE-Inter.txt`](./LICENSE-Inter.txt) (SIL OFL)           |
| `Inter-Bold.ttf`         | the same, bold                       | as above                                                       |
| `NotoSansJP-Regular.ttf` | Japanese — kana and JIS X 0208 kanji | [`LICENSE-NotoSansJP.txt`](./LICENSE-NotoSansJP.txt) (SIL OFL) |

Inter sorts first, so Latin is Inter's even though Noto Sans JP has Latin of its
own.

## Why Japanese has one weight and Latin has two

Inter ships real weights because they are 400KB each. Noto Sans JP does not,
because a second CJK face is another 2MB; a bold Japanese title is drawn in the
regular weight.

## The Japanese subset

`NotoSansJP-Regular.ttf` is not the upstream file. It is
[Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) 2.004 (`v56`
on `fonts.gstatic.com`) cut down to **JIS X 0208** — every kana, every symbol
and all 6,355 kanji of levels 1 and 2. That is 6,878 characters and 2.2MB,
against 16,732 characters and 5.3MB for the whole font.

A character outside that set — `鷗`, `𠮟`, anything in JIS X 0213 but not 0208,
and every script neither font covers — is left out of the card. To cover it,
replace this file with the full Noto Sans JP, or add any other font that has the
character and list it in `server/og.ts`.

### Regenerating it

The character set is JIS X 0208 recovered from the EUC-JP codec, so there is no
list to keep anywhere:

```sh
# The upstream font, as Google Fonts serves it.
curl -sS -H 'User-Agent: curl' \
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400' |
  grep -o 'https://[^)]*\.ttf' |
  xargs curl -sSL -o NotoSansJP-upstream.ttf

# Every character JIS X 0208 can encode.
python3 -c '
codes = set()
for hi in range(0xA1, 0xFF):
    for lo in range(0xA1, 0xFF):
        try:
            codes.add(bytes([hi, lo]).decode("euc_jp"))
        except UnicodeDecodeError:
            pass
print("".join(sorted(codes)), end="")
' > jis0208.txt

# pip install fonttools
python3 -m fontTools.subset NotoSansJP-upstream.ttf \
  --text-file=jis0208.txt \
  --layout-features='*' \
  --output-file=NotoSansJP-Regular.ttf
```

The family name stays `Noto Sans JP`. The OFL requires a rename only for a
Reserved Font Name, and this font's is `Source` — inherited from Source Han
Sans, which Noto Sans CJK is built from.
