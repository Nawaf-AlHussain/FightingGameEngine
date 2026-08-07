# Room & Lobby UX

## Screen Flow

```
[Home] → [Create/Join Room] → [Character Select] → [Waiting] → [Game]
           ↑                                              |
           └──────────────────────────────────────────────┘
```

## Screen 1: Home
```
┌──────────────────────────┐
│    FIGHTING GAME ENGINE  │
│                          │
│   [  Create Room  ]      │
│   [  Join Room    ]      │
│                          │
│   Enter room code:       │
│   [  A 1 B 2 C 3  ]     │
│   [      Join       ]    │
└──────────────────────────┘
```

## Screen 2: Create Room
```
┌──────────────────────────┐
│   Room Created!          │
│                          │
│   Code: A1B2C3           │
│   Share this code with   │
│   your opponent.         │
│                          │
│   Waiting for player 2...│
│                          │
│   Status: ⏳ Waiting     │
└──────────────────────────┘
```

## Screen 3: Character Select
```
┌──────────────────────────┐
│   SELECT YOUR CHARACTER  │
│                          │
│   ┌─────┐ ┌─────┐       │
│   │ Sup │ │ Ngt │       │
│   │ er  │ │ wing│       │
│   └─────┘ └─────┘       │
│   ┌─────┐               │
│   │ Son │               │
│   │ goku│               │
│   └─────┘               │
│                          │
│   [  LOCK IN  ]          │
└──────────────────────────┘
```

## Screen 4: Waiting (post-select)
```
┌──────────────────────────┐
│   Room: A1B2C3           │
│                          │
│   P1: Superman ✓         │
│   P2: Waiting...         │
│                          │
│   [  READY  ]            │
│                          │
│   Starting when both     │
│   players are ready.     │
└──────────────────────────┘
```

## Screen 5: Game
```
┌──────────────────────────┐
│  ┌────────────────────┐  │
│  │                    │  │
│  │    GAME CANVAS     │  │
│  │    (WASM)          │  │
│  │                    │  │
│  └────────────────────┘  │
│                          │
│   (Mobile: touch ctrl)   │
└──────────────────────────┘
```

## Screen 6: Mobile Touch Controls
```
     ┌───┐
     │ U │
┌───┐├───┤┌───┐
│ B ││   ││ F │
└───┘├───┤└───┘
     │ D │
     └───┘

   [A] [B] [C] [X] [Y]
   (action buttons, right side)
```

## Room State Machine

```
         create
  (none) ──────► waiting
                     │  p2 joins
                     ▼
                   selecting
                     │  both lock in
                     ▼
                  ready_up
                     │  both ready
                     ▼
                   playing
                   /      \
            p1 wins      p2 wins
                 \      /
                  ▼    ▼
                finished
```

## Mobile Layout Considerations

- D-pad: 120x120px touch area, bottom-left
- Action buttons: 48px diameter circles, bottom-right
- Canvas: fills remaining space, aspect ratio 4:3 or 16:9
- Minimum viewport: 320px wide (iPhone SE)