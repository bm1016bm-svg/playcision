# Playcision consumer design system

Current direction, 2026-09-18. These rules supersede the original consumer preview brief. The historical terminal direction below applies to CLI output only.

## Visual system

- Deep blue-black canvas `#080D14`, layered blue glass controls, bright text `#F4F8FC` and secondary metadata `#C2D1DF`.
- Lime `#B8E879` identifies selection, discounts and Save. No neon bloom, decorative HUD, fake operating-system bars or device shell.
- Locally bundled Inter Variable; system sans-serif fallback for Traditional Chinese. Body weights 450–550, labels up to 600, brand/game titles/prices 650.
- Glass belongs to navigation and controls. Artwork remains sharp, complete and unfiltered in a 16:9 frame, with letterboxing when Steam's source aspect ratio differs.
- One-pixel borders, restrained inset highlights, 12–16px component radii and a 20px floating navigation container.
- No explanatory filler below actions. Show title, actual platforms, price/discount and at most three source tags. Recommendation evidence belongs in details. Technical source notes are disclosed on demand.

## Behavior

- Skip and Save are the primary decisions. Card tap/Enter/Space opens details. Arrow keys decide; Backspace and the undo control restore the prior session decision.
- Motion follows horizontal movement with small rotation, spring return below threshold, directional exit above threshold, and a real next-game artwork layer beneath.
- Respect reduced motion, increased contrast and reduced transparency; don't animate blur. Opaque backgrounds remain usable without backdrop-filter.
- Drawers isolate background controls, contain keyboard focus, close with Escape and restore the trigger. Actions stay at least 44px tall.
- Mobile layout is content-driven and vertically scrollable. Desktop content has a bounded reading width; short landscape screens use a two-column card and in-flow navigation.
- Collections remain explicitly session-only. Steam library is an external client launcher, not an invented inventory.
- Persistent preferences are read from the existing local state. The UI API exposes only active blocked IDs, never notification markers or price history.

## References and application

The requested UI/UX Pro Max skill was used for design-system and interaction guidance. Its generic neon/purple/font suggestions were overridden by the project's Inter, lime, real-artwork and data-honesty requirements.

[Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials) informs the distinction between translucent controls and content. [Motion AnimatePresence](https://motion.dev/docs/react-animate-presence) informs directional exit data through `custom`/`usePresenceData`.

---

# Historical CLI design notes

## Identity

```text
PLAYCISION // 遊豫不決
STOP BROWSING. START PLAYING.
別選了，開始玩。
GAME OF THROWS // 擲戲之王
```

“Game of Throws” is the wink, not the whole personality. Use it around Roll results, empty states, or onboarding; keep operational errors direct.

## Direction

The visual system is restrained industrial cyberpunk:

- machine-room clarity rather than nightclub neon;
- graphite surfaces, steel rules, and one cool signal color;
- compact information density with generous section separation;
- visible state, provenance, and command affordances;
- square or lightly cut corners, not decorative sci-fi frames;
- motion only for a real transition, request, or roll.

Avoid rainbow gradients, bloom, glass panels, fake scanlines, constant flicker, decorative HUD clutter, and low-contrast gray text.

## Typography

[IBM Plex](https://github.com/IBM/plex) is the recommended family. Use IBM Plex Mono for terminal output, labels, values, and commands in terminal documentation. This terminal guidance does not apply to the consumer web interface.

Suggested stack:

```css
font-family: "IBM Plex Mono", "Cascadia Mono", "SFMono-Regular",
  Consolas, "Liberation Mono", monospace;
```

Do not bundle font files without preserving the IBM Plex Open Font License. The CLI cannot choose a terminal's installed font; documentation may recommend it, while output must remain legible in any monospace fallback.

## Suggested tokens

These are design choices, not claims about the current terminal implementation:

| Role | Token |
| --- | --- |
| Canvas | `#0B0F12` |
| Raised surface | `#11171C` |
| Primary text | `#D7DEE4` |
| Muted text | `#89949D` |
| Rule / border | `#2B353D` |
| Signal cyan | `#63C7D5` |
| Warning amber | `#D6A85F` |
| Danger red | `#D16A65` |

Use signal cyan sparingly for selection, live status, links, and the `//` section marker. Never encode success, warning, or failure by color alone.

## Layout

Terminal sections follow a stable rhythm:

```text
────────────────────────────────────────────────────────
PLAYCISION // 遊豫不決
STOP BROWSING. START PLAYING. / GAME OF THROWS // 擲戲之王
────────────────────────────────────────────────────────
// DEALS [03]
01  GAME NAME                    -40%
    NT$268  ·  ROGUELIKE  ·  LOCAL OBSERVED LOW
```

- Put the answer first: game, price, discount, and why it matched.
- Keep metadata to one secondary line where width allows.
- Show live-fetch time and provider warnings near the affected section.
- Label local observation explicitly; never abbreviate it to historical low.
- Use stable indices and plain URLs in terminal output.
- Wrap at terminal width and preserve a useful layout at narrow sizes.

## Interaction

- Discover and Deals are scans; Roll is a deliberate act with a displayed seed.
- Reroll increments a visible counter. It should not silently mutate the original result.
- Skip must show duration; exclude must state permanence and how to undo it.
- Open Store and Launch are explicit actions, never automatic side effects of rendering.
- Destructive reset or overwrite actions require a target preview.

## Accessibility

- Respect the `NO_COLOR` environment variable.
- Pair color with labels such as `[PASS]`, `[WARN]`, and `[FAIL]`.
- Keep all information available in plain text and JSON.
- Avoid rapid animation, flashing, and continuous cursor effects.
- Test light/dark terminal themes, redirected output, narrow widths, CJK text, long localized names, and screen-reader-friendly ordering.

## Voice

Short, factual, slightly dry:

- “12 live candidates. One throw.”
- “Local observed low since 2026-08-10.”
- “Steam changed the response shape; state was not modified.”
- “Webhook rejected. Secret redacted.”

Do not anthropomorphize the recommender or invent confidence. Explain rules and observable reasons.
