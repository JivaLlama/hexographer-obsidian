---
id: harbor
name: The Harbor Count
epochOffset: 10000
hasYearZero: true
weekdayOfEpoch: 0
time:
  hoursPerDay: 24
  minutesPerHour: 60
months:
  - id: tidewake
    name: Tidewake
    short: Tid
    days: 36
  - id: foamrise
    name: Foamrise
    short: Foa
    days: 36
  - id: kelpmoon
    name: Kelpmoon
    short: Kel
    days: 36
  - id: saltbar
    name: Saltbar
    short: Sal
    days: 36
  - id: drift
    name: Drift
    short: Dri
    days: 36
  - id: calmwater
    name: Calmwater
    short: Cal
    days: 36
  - id: stormglass
    name: Stormglass
    short: Sto
    days: 36
  - id: wrack
    name: Wrack
    short: Wra
    days: 36
  - id: icefloe
    name: Icefloe
    short: Ice
    days: 36
  - id: stilldeep
    name: Stilldeep
    short: Sti
    days: 36
weekdays:
  - id: sailday
    name: Sailday
    short: Sai
  - id: helmday
    name: Helmday
    short: Hel
  - id: netday
    name: Netday
    short: Net
  - id: keelday
    name: Keelday
    short: Kee
  - id: galeday
    name: Galeday
    short: Gal
  - id: havenday
    name: Havenday
    short: Hav
leap:
  kind: none
eras: []
formats:
  year: "{y}"
  month: "{y} {MMMM}"
  day: "{y} {MMMM} {d}"
  hour: "{y} {MMMM} {d} {HH}"
  minute: "{y} {MMMM} {d} {HH}:{mm}"
  long: "{y} {MMMM} {d}"
  short: "{y}"
defaultFormat: day
---

The Harbor Count is a second sample calendar. Ten 36-day months, no leap day, and a six-day week. Local day 0 is world day 10000, so it does not share an epoch with the Reckoning. A master timeline places both on one axis through world days.
