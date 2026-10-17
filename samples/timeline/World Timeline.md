# World timeline

This note renders a timeline inline. Click the block before using the wheel, so the note keeps scrolling until then. Ctrl or Cmd and the wheel zooms either way. Shift+wheel, or a horizontal trackpad swipe, pans time without focusing the block. Press F while the block is focused to fit the range. Double-click empty space to zoom in.

**Open in full view** opens the same block in a workspace leaf. There, the wheel pans time and Shift+wheel scrolls lanes.

```worldtimeline
calendar: reckoning
source:
  folders: [samples/timeline]
lanes:
  order: ["[[House Vey]]", "[[Climate]]", "[[Treaties]]", "[[Records]]"]
view:
  from: "3A 370"
  to: "3A 450"
```

Dates use the Reckoning calendar in `samples/calendars/reckoning.calendar.md`. The notes under this folder are the era, the spans, and the events. Uncertain and open notes show certainty. Ordered notes have `order` and `era` and no `start`.

A second block labels generic markers in years before a present year. The axis uses years-ago labels. The notes still store absolute years.

```worldtimeline
calendar: yearsago
source:
  folders: [samples/timeline/yearsago]
view:
  from: "600"
  to: "1700"
```

