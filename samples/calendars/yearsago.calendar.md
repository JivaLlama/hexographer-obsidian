---
id: yearsago
name: Years Ago
epochOffset: 0
hasYearZero: true
weekdayOfEpoch: 0
intercalaryInWeek: false
time:
  hoursPerDay: 24
  minutesPerHour: 60
months:
  - id: m1
    name: Month 1
    short: M1
    days: 30
  - id: m2
    name: Month 2
    short: M2
    days: 30
  - id: m3
    name: Month 3
    short: M3
    days: 30
  - id: m4
    name: Month 4
    short: M4
    days: 30
  - id: m5
    name: Month 5
    short: M5
    days: 30
  - id: m6
    name: Month 6
    short: M6
    days: 30
  - id: m7
    name: Month 7
    short: M7
    days: 30
  - id: m8
    name: Month 8
    short: M8
    days: 30
  - id: m9
    name: Month 9
    short: M9
    days: 30
  - id: m10
    name: Month 10
    short: M10
    days: 30
  - id: m11
    name: Month 11
    short: M11
    days: 30
  - id: m12
    name: Month 12
    short: M12
    days: 30
weekdays:
  - id: d1
    name: Day 1
    short: D1
  - id: d2
    name: Day 2
    short: D2
  - id: d3
    name: Day 3
    short: D3
  - id: d4
    name: Day 4
    short: D4
  - id: d5
    name: Day 5
    short: D5
  - id: d6
    name: Day 6
    short: D6
  - id: d7
    name: Day 7
    short: D7
leap:
  kind: cycle
  every: 4
eras: []
formats:
  year: "{y}"
  month: "{y}-{MM}"
  day: "{y}-{MM}-{dd}"
  hour: "{y}-{MM}-{dd} {HH}"
  minute: "{y}-{MM}-{dd} {HH}:{mm}"
  ago: "{ya}"
defaultFormat: day
display:
  mode: before-present
  presentYear: 2000
  suffix: ya
---

A generic display calendar. Year labels count down toward year 2000 (`1500 ya`). Stored dates stay absolute years; `{ya}` is not accepted as input.
