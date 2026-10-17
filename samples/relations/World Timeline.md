# Relations

Vault time units are a plugin setting, one per line. This chain uses:

```
gen: 40-60y
```

`y`, `mo`, and `d` are built in. With that unit, Marker A is exact and each later marker is one generation after the previous one, so the fuzzy edge widens at every hop.

```worldtimeline
calendar: reckoning
source:
  folders: [samples/relations]
filters:
  accounts: true
lanes:
  order: ["[[Chain]]", "[[Accounts]]"]
view:
  from: "3A 380"
  to: "3A 640"
```

A culture timeline swaps the matching account into the primary bar. Ghosts stay on when `accounts` is true.

```worldtimeline
calendar: reckoning
source:
  folders: [samples/relations]
filters:
  cultures: ["[[South]]"]
  accounts: true
view:
  from: "3A 400"
  to: "3A 450"
```
