; コンフィギュレーション

[Remap]
x = x
y = y
z = z
a = a
b = b
c = c
s = s

;-| CPUアルゴリズム用コマンド |------------------------------

[Command]
name = "cpu1"
command = a,U,D,F,F,B,B,D,U,U
time = 1
[Command]
name = "cpu2"
command = b,U,D,F,B,F,B,D,U,D
time = 1
[Command]
name = "cpu3"
command = c,U,D,B,F,B,F,D,U,B
time = 1
[Command]
name = "cpu4"
command = x,U,D,B,F,F,B,D,U,F
time = 1
[Command]
name = "cpu5"
command = y,U,D,F,F,B,B,D,U,a
time = 1
[Command]
name = "cpu6"
command = z,U,D,F,B,F,B,D,U,b
time = 1
[Command]
name = "cpu7"
command = s,U,D,B,F,B,F,D,U,c
time = 1
[Command]
name = "cpu8"
command = b,U,D,B,F,F,B,D,U,x
time = 1
[Command]
name = "cpu9"
command = c,U,D,F,B,F,B,D,U,y
time = 1
[Command]
name = "cpu10"
command = c,U,D,B,B,F,B,D,U,y
time = 1
[Command]
name = "cpu11"
command = a,U,D,F,F,B,B,B,D,U,U
time = 1
[Command]
name = "cpu12"
command = b,U,D,F,B,F,B,B,D,U,D
time = 1
[Command]
name = "cpu13"
command = c,U,D,B,B,F,B,F,D,U,B
time = 1
[Command]
name = "cpu14"
command = x,U,D,B,F,B,F,B,D,U,F
time = 1
[Command]
name = "cpu15"
command = y,U,D,F,F,B,B,B,D,U,a
time = 1
[Command]
name = "cpu16"
command = z,U,B,D,F,B,F,B,D,U,b
time = 1
[Command]
name = "cpu17"
command = s,U,D,B,F,B,F,B,D,U,c
time = 1
[Command]
name = "cpu18"
command = b,U,D,B,F,B,F,B,D,U,x
time = 1
[Command]
name = "cpu19"
command = c,U,D,F,B,B,F,B,D,U,y
time = 1
[Command]
name = "cpu20"
command = c,U,D,B,B,B,F,B,D,U,y
time = 1
[Command]
name = "cpu21"
command = a,U,D,F,F,s,B,B,D,U,U
time = 1
[Command]
name = "cpu22"
command = b,U,s,D,F,B,F,B,D,U,D
time = 1
[Command]
name = "cpu23"
command = c,U,D,B,F,B,F,s,D,U,B
time = 1
[Command]
name = "cpu24"
command = x,U,D,B,s,F,F,B,D,U,F
time = 1
[Command]
name = "cpu25"
command = y,U,D,s,F,F,B,B,D,U,a
time = 1
[Command]
name = "cpu26"
command = z,U,D,F,B,F,s,B,D,U,b
time = 1
[Command]
name = "cpu27"
command = s,U,D,s,B,F,B,F,D,U,c
time = 1
[Command]
name = "cpu28"
command = b,U,D,B,s,F,F,B,s,D,U,x
time = 1
[Command]
name = "cpu29"
command = c,U,D,F,s,B,F,B,D,U,y
time = 1
[Command]
name = "cpu30"
command = c,U,D,B,B,F,B,s,D,U,y
time = 1

; コマンド
;-| Super Motions |--------------------------------------------------------

[Command]
name = "dragonrush"
command = ~D, B, F, b
time = 30

[Command]
name = "shinkuu"
command = ~D, F, D, F, y
time = 25

[Command]
name = "bakuhatsu"
command = ~D, F, D, F, b
time = 25

[Command]
name = "mega"
command = ~D, B, F, y
time = 20


;-| Special Motions |------------------------------------------------------

[Command]
name = "shoryuken"
command = ~F, D, DF, x
time = 20

[Command]
name = "shoryuken2"
command = ~F, D, DF, y
time = 20

[Command]
name = "hadouken"
command = ~D, F, x
time = 20

[Command]
name = "hadouken2"
command = ~D, F, y
time = 20

[Command]
name = "tatsumaki"
command = ~D, B, a
time = 20

[Command]
name = "tatsumaki"
command = ~D, B, b
time = 20

[Command]
name = "flyingattack"
command = ~D, B, x
time = 20

[Command]
name = "flyingattack2"
command = ~D, B, y
time = 20

[command]
name = "superdash"
command = ~D, F, a
time = 20

[command]
name = "superdash2"
command = ~D, F, b
time = 20

[Command]
name = "dash_x"
command = ~F, F, x

[Command]
name = "dash_y"
command = ~F, F, y

[Command]
name = "dash_a"
command = ~F, F, a

[Command]
name = "dash_b"
command = ~F, F, b

;-| Double Tap |-----------------------------------------------------------
[Command]
name = "FF"
command = F, F
time = 10

[Command]
name = "BB"
command = B, B
time = 10

;-| 2/3 Button Combination |-----------------------------------------------
[Command]
name = "recovery"
command = x+a
time = 1

[Command]
name = "recovery"
command = c
time = 1

[Command]
name = "charge"
command = y+b
time = 1

;-| Dir + Button |---------------------------------------------------------
[Command]
name = "down_a"
command = /$D,a
time = 1

[Command]
name = "down_b"
command = /$D,b
time = 1

;-| Single Button |---------------------------------------------------------
[Command]
name = "a"
command = a
time = 1

[Command]
name = "b"
command = b
time = 1

[Command]
name = "c"
command = c
time = 1

[Command]
name = "x"
command = x
time = 1

[Command]
name = "y"
command = y
time = 1

[Command]
name = "z"
command = z
time = 1

[Command]
name="fwd"
command=F
time=1

[Command]
name="back"
command=B
time=1

[Command]
name="up"
command=U
time=1

[Command]
name="down"
command=D
time=1

[Command]
name = "hold_a"
command = /$a
time = 1

[Command]
name = "hold_b"
command = /$b
time = 1

[Command]
name = "hold_c"
command = /$c
time = 1

[Command]
name = "hold_x"
command = /$x
time = 1

[Command]
name = "hold_y"
command = /$y
time = 1

[Command]
name = "hold_z"
command = /$z
time = 1

[Command]
name = "start"
command = s
time = 1

;-| Hold Dir |--------------------------------------------------------------
[Command]
name = "holdfwd";Required (do not remove)
command = /$F
time = 1

[Command]
name = "holdback";Required (do not remove)
command = /$B
time = 1

[Command]
name = "holdup" ;Required (do not remove)
command = /$U
time = 1

[Command]
name = "holddown";Required (do not remove)
command = /$D
time = 1

[Command]
name = "holddownfwd";Required (do not remove)
command = /$DF
time = 1

[Command]
name = "longjump"
command = ~D, $U
time = 11

[Statedef -1]

;---------------------------------------------------------------------------
;---------------------------------------------------------------------------
;=============================必殺技========================================
;---------------------------------------------------------------------------
;---------------------------------------------------------------------------

; プラネットバースト
[State -1,]
type = ChangeState
value = 2300
triggerall = var(59) = 0
triggerall = command = "dragonrush"
triggerall = power >= 3000
trigger1 = ctrl
trigger1 = statetype != A
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 230 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 204 && movecontact
trigger8 = stateno = 250 && movecontact
trigger9 = stateno = 260 && movecontact
trigger10 = stateno = 270 && movecontact
trigger11 = stateno = 400 && movecontact
trigger12 = stateno = 410 && movecontact
trigger13 = stateno = 420 && movecontact
trigger14 = stateno = 450 && movecontact
trigger15 = stateno = 500 && movecontact
trigger16 = stateno = 550 && movecontact

; 超爆発波
[State -1,]
type = ChangeState
value = 2200
triggerall = var(59) = 0
triggerall = command = "bakuhatsu"
triggerall = power >= 2000
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 230 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 204 && movecontact
trigger8 = stateno = 250 && movecontact
trigger9 = stateno = 260 && movecontact
trigger10 = stateno = 270 && movecontact
trigger11 = stateno = 400 && movecontact
trigger12 = stateno = 410 && movecontact
trigger13 = stateno = 420 && movecontact
trigger14 = stateno = 450 && movecontact
trigger15 = stateno = 500 && movecontact

; ギャリック砲
[State -1,]
type = ChangeState
value = 2000
triggerall = var(59) = 0
triggerall = command = "shinkuu"
triggerall = power >= 1000
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 230 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 204 && movecontact
trigger8 = stateno = 250 && movecontact
trigger9 = stateno = 260 && movecontact
trigger10 = stateno = 270 && movecontact
trigger11 = stateno = 400 && movecontact
trigger12 = stateno = 410 && movecontact
trigger13 = stateno = 420 && movecontact
trigger14 = stateno = 450 && movecontact
trigger15 = stateno = 500 && movecontact

; 空中ギャリック砲
[State -1,]
type = ChangeState
value = 2100
triggerall = var(59) = 0
triggerall = command = "shinkuu"
triggerall = power >= 1000
trigger1 = statetype = A
trigger1 = ctrl
trigger2 = stateno = 600 && movecontact
trigger3 = stateno = 610 && movecontact
trigger4 = stateno = 620 && movecontact
trigger5 = stateno = 630 && movecontact
trigger6 = stateno = 635 && movecontact
trigger7 = stateno = 640 && movecontact
trigger8 = stateno = 650 && movecontact

; ダッシュボム
[State -1,]
type = ChangeState
value = 1700
triggerall = var(59) = 0
triggerall = command = "mega"
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 230 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 204 && movecontact
trigger8 = stateno = 250 && movecontact
trigger9 = stateno = 260 && movecontact
trigger10 = stateno = 270 && movecontact
trigger11 = stateno = 400 && movecontact
trigger12 = stateno = 410 && movecontact
trigger13 = stateno = 420 && movecontact
trigger14 = stateno = 450 && movecontact
trigger15 = stateno = 500 && movecontact


; スラッシュアロー（弱）
[State -1,]
type = ChangeState
value = 1200
triggerall = var(59) = 0
triggerall = command = "shoryuken"
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 100
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact; = 1
trigger4 = stateno = 210 && movecontact; = 1
trigger5 = stateno = 230 && movecontact; = 1
trigger6 = stateno = 200 && movecontact; = 1
trigger7 = stateno = 204 && movecontact; = 1
trigger8 = stateno = 250 && movecontact; = 1
trigger9 = stateno = 260 && movecontact; = 1
trigger10 = stateno = 270 && movecontact; = 1
trigger11 = stateno = 400 && movecontact; = 1
trigger12 = stateno = 410 && movecontact; = 1
trigger13 = stateno = 420 && movecontact; = 1
trigger14 = stateno = 450 && movecontact; = 1
trigger15 = stateno = 500 && movecontact; = 1
trigger16 = stateno = 550 && movecontact
trigger17 = stateno = 5120
trigger18 = stateno = 101 || stateno = 102

; スラッシュアロー（強）
[State -1,]
type = ChangeState
value = 1250
triggerall = var(59) = 0
triggerall = command = "shoryuken2"
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 100
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact; = 1
trigger4 = stateno = 210 && movecontact; = 1
trigger5 = stateno = 230 && movecontact; = 1
trigger6 = stateno = 200 && movecontact; = 1
trigger7 = stateno = 204 && movecontact; = 1
trigger8 = stateno = 250 && movecontact; = 1
trigger9 = stateno = 260 && movecontact; = 1
trigger10 = stateno = 270 && movecontact; = 1
trigger11 = stateno = 400 && movecontact; = 1
trigger12 = stateno = 410 && movecontact; = 1
trigger13 = stateno = 420 && movecontact; = 1
trigger14 = stateno = 450 && movecontact; = 1
trigger15 = stateno = 500 && movecontact; = 1
trigger16 = stateno = 550 && movecontact
trigger17 = stateno = 5120
trigger18 = stateno = 101 || stateno = 102


; 連続エネルギー弾（弱）
[State -1]
type = ChangeState
value = 1000
triggerall = var(59) = 0
triggerall = command = "hadouken"
triggerall = power >= 100
triggerall = numproj = 0
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 100
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact; = 1
trigger4 = stateno = 210 && movecontact; = 1
trigger5 = stateno = 230 && movecontact; = 1
trigger6 = stateno = 200 && movecontact; = 1
trigger7 = stateno = 204 && movecontact; = 1
trigger8 = stateno = 250 && movecontact; = 1
trigger9 = stateno = 260 && movecontact; = 1
trigger10 = stateno = 270 && movecontact; = 1
trigger11 = stateno = 400 && movecontact; = 1
trigger12 = stateno = 410 && movecontact; = 1
trigger13 = stateno = 420 && movecontact; = 1
trigger14 = stateno = 450 && movecontact; = 1
trigger15 = stateno = 500 && movecontact; = 1

; エネルギー弾（強）
[State -1]
type = ChangeState
value = 1005
triggerall = var(59) = 0
triggerall = command = "hadouken2"
triggerall = power >= 100
triggerall = numproj = 0 || Numprojid(1000) = 2 || Numprojid(1005) = 0
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 100
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact; = 1
trigger4 = stateno = 210 && movecontact; = 1
trigger5 = stateno = 230 && movecontact; = 1
trigger6 = stateno = 200 && movecontact; = 1
trigger7 = stateno = 204 && movecontact; = 1
trigger8 = stateno = 250 && movecontact; = 1
trigger9 = stateno = 260 && movecontact; = 1
trigger10 = stateno = 270 && movecontact; = 1
trigger11 = stateno = 400 && movecontact; = 1
trigger12 = stateno = 410 && movecontact; = 1
trigger13 = stateno = 420 && movecontact; = 1
trigger14 = stateno = 450 && movecontact; = 1
trigger15 = stateno = 500 && movecontact; = 1
trigger16 = stateno = 1000 && AnimElem = 9, >= 1 && AnimElem = 11, <= 1

; 空中連続エネルギー弾（弱）
[State -1,]
type = ChangeState
value = 1100
triggerall = var(59) = 0
triggerall = command = "hadouken"
triggerall = power >= 100
triggerall = numproj = 0
trigger1 = statetype = A
trigger1 = ctrl
trigger2 = stateno = 600 && movecontact
trigger3 = stateno = 610 && movecontact
trigger4 = stateno = 620 && movecontact
trigger5 = stateno = 630 && movecontact
trigger6 = stateno = 635 && movecontact
trigger7 = stateno = 640 && movecontact
trigger8 = stateno = 650 && movecontact

; 空中エネルギー弾（強）
[State -1,]
type = ChangeState
value = 1105
triggerall = var(59) = 0
triggerall = command = "hadouken2"
triggerall = power >= 100
triggerall = numproj = 0 || Numprojid(1100) = 2 || Numprojid(1105) = 0
trigger1 = statetype = A
trigger1 = ctrl
trigger2 = stateno = 600 && movecontact
trigger3 = stateno = 610 && movecontact
trigger4 = stateno = 620 && movecontact
trigger5 = stateno = 630 && movecontact
trigger6 = stateno = 635 && movecontact
trigger7 = stateno = 640 && movecontact
trigger8 = stateno = 650 && movecontact
trigger9 = stateno = 1100 && AnimElem = 9, >= 1 && AnimElem = 11, <= 1

; ジャンピングアロー
[State -1,]
type = ChangeState
value = 1300
triggerall = var(59) = 0
triggerall = command = "tatsumaki"
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 230 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 204 && movecontact
trigger8 = stateno = 250 && movecontact
trigger9 = stateno = 260 && movecontact
trigger10 = stateno = 270 && movecontact
trigger11 = stateno = 400 && movecontact
trigger12 = stateno = 410 && movecontact
trigger13 = stateno = 420 && movecontact
trigger14 = stateno = 450 && movecontact
trigger15 = stateno = 500 && movecontact

; フライングアロー（弱）
[State -1,]
type = ChangeState
value = 1400
triggerall = var(59) = 0
triggerall = command = "flyingattack"
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 230 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 204 && movecontact
trigger8 = stateno = 250 && movecontact
trigger9 = stateno = 260 && movecontact
trigger10 = stateno = 270 && movecontact
trigger11 = stateno = 400 && movecontact
trigger12 = stateno = 410 && movecontact
trigger13 = stateno = 420 && movecontact
trigger14 = stateno = 450 && movecontact
trigger15 = stateno = 500 && movecontact

; フライングアロー（強）
[State -1,]
type = ChangeState
value = 1450
triggerall = var(59) = 0
triggerall = command = "flyingattack2"
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 230 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 204 && movecontact
trigger8 = stateno = 250 && movecontact
trigger9 = stateno = 260 && movecontact
trigger10 = stateno = 270 && movecontact
trigger11 = stateno = 400 && movecontact
trigger12 = stateno = 410 && movecontact
trigger13 = stateno = 420 && movecontact
trigger14 = stateno = 450 && movecontact
trigger15 = stateno = 500 && movecontact

; フライングアロー（弱）
[State -1,]
type = ChangeState
value = 1800
triggerall = var(59) = 0
triggerall = command = "flyingattack"
trigger1 = statetype = A
trigger1 = ctrl
trigger2 = stateno = 600 && movecontact
trigger3 = stateno = 610 && movecontact
trigger4 = stateno = 620 && movecontact
trigger5 = stateno = 630 && movecontact
trigger6 = stateno = 635 && movecontact
trigger7 = stateno = 640 && movecontact
trigger8 = stateno = 650 && movecontact

; フライングアロー（強）
[State -1,]
type = ChangeState
value = 1850
triggerall = var(59) = 0
triggerall = command = "flyingattack2"
trigger1 = statetype = A
trigger1 = ctrl
trigger2 = stateno = 600 && movecontact
trigger3 = stateno = 610 && movecontact
trigger4 = stateno = 620 && movecontact
trigger5 = stateno = 630 && movecontact
trigger6 = stateno = 635 && movecontact
trigger7 = stateno = 640 && movecontact
trigger8 = stateno = 650 && movecontact

; スーパーダッシュ（弱）
[State -1,]
type = ChangeState
value = 1500
triggerall = var(59) = 0
triggerall = command = "superdash"
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 230 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 204 && movecontact
trigger8 = stateno = 250 && movecontact
trigger9 = stateno = 260 && movecontact
trigger10 = stateno = 270 && movecontact
trigger11 = stateno = 400 && movecontact
trigger12 = stateno = 410 && movecontact
trigger13 = stateno = 420 && movecontact
trigger14 = stateno = 450 && movecontact
trigger15 = stateno = 500 && movecontact

; スーパーダッシュ（強）
[State -1,]
type = ChangeState
value = 1510
triggerall = var(59) = 0
triggerall = command = "superdash2"
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 230 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 204 && movecontact
trigger8 = stateno = 250 && movecontact
trigger9 = stateno = 260 && movecontact
trigger10 = stateno = 270 && movecontact
trigger11 = stateno = 400 && movecontact
trigger12 = stateno = 410 && movecontact
trigger13 = stateno = 420 && movecontact
trigger14 = stateno = 450 && movecontact
trigger15 = stateno = 500 && movecontact

; ドライビングエルボー
;[State -1,]
;type = ChangeState
;value = 1600
;triggerall = stateno = 1500 || stateno = 1510
;triggerall = command = "x" || command = "y" 
;trigger1 = statetype != A
;trigger1 = ctrl
;trigger2 = stateno = 1500
;trigger2 = animelem = 5, >= 1
;trigger3 = stateno = 1510
;trigger3 = animelem = 5, >= 1

; ダッシュ強パンチ (ニュートラル)
[State -1,]
type = ChangeState
value = 510
triggerall = var(59) = 0
triggerall = command = "dash_y"
trigger1 = statetype != A
trigger1 = ctrl
trigger2 = stateno = 100
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 220 && movecontact; = 1
trigger4 = stateno = 210 && movecontact; = 1
trigger5 = stateno = 230 && movecontact; = 1
trigger6 = stateno = 200 && movecontact; = 1
trigger7 = stateno = 204 && movecontact; = 1
trigger8 = stateno = 250 && movecontact; = 1
trigger9 = stateno = 260 && movecontact; = 1
trigger10 = stateno = 270 && movecontact; = 1
trigger11 = stateno = 400 && movecontact; = 1
trigger12 = stateno = 410 && movecontact; = 1
trigger13 = stateno = 420 && movecontact; = 1
trigger14 = stateno = 450 && movecontact; = 1
trigger15 = stateno = 500 && movecontact; = 1

;---------------------------------------------------------------------------
;============================特殊技=========================================
;---------------------------------------------------------------------------

;ダッシュ
[State -1, Run Fwd]
type = ChangeState
value = 100
trigger1 = command = "FF"
trigger1 = statetype = S
trigger1 = ctrl

;空中ダッシュ
[State -1, Run Fwd]
type = ChangeState
value = 110
trigger1 = command = "FF"
trigger1 = statetype = A
trigger1 = ctrl

; バックステップ
[State -1, Run Back]
type = ChangeState
value = 105
trigger1 = command = "BB"
trigger1 = statetype = S
trigger1 = ctrl

; 空中バックダッシュ
[State -1, Run Back]
type = ChangeState
value = 112
triggerall = vel x <= 0;-1 
trigger1 = command = "BB"
trigger1 = statetype = A
trigger1 = ctrl

; 投げ
[State -1,]
type = ChangeState
value = 800
triggerall = var(59) = 0
triggerall = (command = "holdfwd" || command = "holdback") && (command = "y")
triggerall = statetype = S
triggerall = ctrl
triggerall = stateno != 100
trigger1 = p2bodydist X < 7
trigger1 = (p2statetype = S) || (p2statetype = C)
trigger1 = p2movetype != H

; きたねぇ花火（カウンター）
[State -1]
type = ChangeState
value = 305
triggerall = var(59) = 0
triggerall = command = "recovery" ^^ command = "z"
trigger1 = (stateno = 150 || stateno = 151) && power >= 1000
trigger2 = (stateno = 152 || stateno = 153) && power >= 1000

; 気力溜め
[State -1]
type = ChangeState
value = 1900
triggerall = var(59) = 0
triggerall = statetype = S
triggerall = Power < 3000
triggerall = ctrl = 1
trigger1 = command = "hold_b" && command = "hold_y"
trigger2 = command = "hold_c"

; 挑発
[State -1]
type = ChangeState
value = 195
triggerall = var(59) = 0
trigger1 = command = "start"
trigger1 = Vel X = 0
trigger1 = stateno != 195
trigger1 = statetype = S
trigger1 = ctrl = 1

; 高速移動 (後方)
[State -1]
type = ChangeState
value = 360
triggerall = var(59) = 0
triggerall = command = "recovery" ^^ command = "z"
triggerall = command = "holdback"
trigger1 = statetype = S
trigger1 = ctrl
trigger2 = stateno = 100
trigger3 = stateno = 101
trigger4 = stateno = 102

; 高速移動 (前方)
[State -1]
type = ChangeState
value = 361
triggerall = var(59) = 0
triggerall = command = "recovery" ^^ command = "z"
trigger1 = statetype = S
trigger1 = ctrl

 ダッシュ高速移動 (前方)
[State -1]
type = ChangeState
value = 361
triggerall = var(59) = 0
triggerall = stateno = 100 || stateno = 101 || stateno = 102
triggerall = ctrl = 0
trigger1 = command = "hold_x" && command = "hold_a" 
trigger2 = command = "hold_z"
trigger3 = command = "hold_c"


;---------------------------------------------------------------------------
;=======================ダッシュ攻撃========================================
;---------------------------------------------------------------------------

; ダッシュ強パンチ (ダッシュ中)
[State -1,]
type = ChangeState
value = 511
triggerall = var(59) = 0
triggerall = stateno = 101
trigger1 = command = "hold_y"

; ダッシュ弱パンチ (ダッシュ中)
[State -1,]
type = ChangeState
value = 500
triggerall = var(59) = 0
triggerall = stateno = 101
trigger1 = command = "hold_x"

 ダッシュ弱キック (スライディングキック)
[State -1,]
type = ChangeState
value = 550
triggerall = var(59) = 0
triggerall = stateno = 101
trigger1 = command = "hold_a"

 ダッシュ強キック (ダッシュ中)
[State -1,]
type = ChangeState
value = 525
triggerall = var(59) = 0
triggerall = stateno = 101
trigger1 = command = "hold_b"

;---------------------------------------------------------------------------
;============================通常技=========================================
;---------------------------------------------------------------------------
;-------------パンチ

; 弱パンチ (近距離)
[State -1,]
type = ChangeState
value = 210
triggerall = var(59) = 0
triggerall = command = "x"
triggerall = command != "holddown"
triggerall = p2bodydist x < 4
trigger1 = statetype = S
trigger1 = ctrl = 1
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 210 && movecontact
trigger4 = stateno = 500 && movecontact

; 弱パンチ
[State -1,]
type = ChangeState
value = 200
triggerall = var(59) = 0
triggerall = command = "x"
triggerall = command != "holddown"
trigger1 = statetype = S
trigger1 = ctrl = 1
trigger2 = stateno = 52 || stateno = 101
trigger2 = animelem = 1, >= 1
trigger3 = stateno = 200
trigger3 = time > 9
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 260 && movecontact
trigger6 = stateno = 500 && movecontact

; 強パンチ (近距離)
[State -1,]
type = ChangeState
value = 230
triggerall = var(59) = 0
triggerall = command = "y"
triggerall = command != "holddown"
triggerall = p2bodydist x < 15
trigger1 = statetype = S
trigger1 = ctrl = 1
trigger2 = stateno = 210 && movecontact
trigger3 = stateno = 200 && movecontact
trigger4 = stateno = 500 && movecontact

; 強パンチ
[State -1,]
type = ChangeState
value = 220
triggerall = var(59) = 0
triggerall = command = "y"
triggerall = command != "holddown"
trigger1 = statetype = S
trigger1 = ctrl = 1
trigger2 = stateno = 230 && movecontact
trigger3 = stateno = 200 && movecontact
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 250 && movecontact
trigger6 = stateno = 260 && movecontact
trigger7 = stateno = 500 && movecontact

;-------------------------------------------キック

; 弱キック (近距離)
[State -1,]
type = ChangeState
value = 260
triggerall = var(59) = 0
triggerall = command = "a"
triggerall = command != "holddown"
triggerall = p2bodydist x < 5
trigger1 = statetype = S
trigger1 = ctrl = 1
trigger2 = stateno = 235
trigger2 = time > 3
trigger3 = stateno = 210 && movecontact
trigger4 = stateno = 200 && movecontact
trigger5 = stateno = 500 && movecontact

; 弱キック
[State -1,]
type = ChangeState
value = 250
triggerall = var(59) = 0
triggerall = command = "a"
triggerall = command != "holddown"
trigger1 = statetype = S
trigger1 = ctrl = 1
trigger2 = stateno = 250
trigger2 = time > 14
trigger3 = stateno = 260
trigger3 = time > 3
trigger4 = stateno = 210 && movecontact
trigger5 = stateno = 200 && movecontact
trigger6 = stateno = 500 && movecontact
trigger7 = stateno = 250 && movecontact

; 強キック (近距離)
[State -1,]
type = ChangeState
value = 280
triggerall = var(59) = 0
triggerall = command = "b"
triggerall = command != "holddown"
triggerall = p2bodydist x < 25
trigger1 = statetype = S
trigger1 = ctrl = 1
trigger2 = stateno = 230 && movecontact
trigger3 = stateno = 200 && movecontact
;trigger4 = stateno = 250 && movecontact
trigger4 = stateno = 260 && movecontact
trigger5 = stateno = 500 && movecontact

; 強キック
[State -1]
type = ChangeState
value = 270
triggerall = var(59) = 0
triggerall = command = "b"
triggerall = command != "holddown"
trigger1 = statetype = S
trigger1 = ctrl = 1
trigger2 = stateno = 220 && movecontact
trigger3 = stateno = 210 && movecontact
trigger4 = stateno = 230 && movecontact
trigger5 = stateno = 200 && movecontact
trigger6 = stateno = 250 && movecontact
;trigger7 = stateno = 260 && movecontact
trigger7 = stateno = 500 && movecontact

;---------------------------------------------------------------------------
;============================しゃがみ=========================================
;---------------------------------------------------------------------------

; しゃがみ弱パンチ
[State -1]
type = ChangeState
value = 410
triggerall = var(59) = 0
triggerall = command = "x"
triggerall = command = "holddown"
trigger1 = statetype = C
trigger1 = ctrl
trigger2 = stateno = 101
trigger3 =  stateno = 410
trigger3 =  time > 6
trigger4 = stateno = 500 && movecontact

; しゃがみ強パンチ
[State -1]
type = ChangeState
value = 400
triggerall = var(59) = 0
triggerall = command = "y"
triggerall = command = "holddown"
trigger1 = statetype = C
trigger1 = ctrl
trigger2 = stateno = 101
trigger3 = stateno = 420 && movecontact
trigger4 = stateno = 410 && movecontact
trigger5 = stateno = 210 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 250 && movecontact
trigger8 = stateno = 260 && movecontact
trigger9 = stateno = 500 && movecontact

; しゃがみ弱キック
[State -1]
type = ChangeState
value = 420
triggerall = var(59) = 0
triggerall = command = "a"
triggerall = command = "holddown"
trigger1 = statetype = C
trigger1 = ctrl
trigger2 = stateno = 101
trigger3 = stateno = 420 && movecontact
trigger3 = time > 4
trigger4 = stateno = 410 && movecontact
trigger5 = stateno = 210 && movecontact
trigger6 = stateno = 200 && movecontact
trigger7 = stateno = 500 && movecontact

; しゃがみ強キック
[State -1]
type = ChangeState
value = 450
triggerall = var(59) = 0
triggerall = command = "b"
triggerall = command = "holddown"
trigger1 = statetype = C
trigger1 = ctrl
trigger2 = stateno = 101
trigger3 = stateno = 420 && movecontact
trigger4 = stateno = 410 && movecontact
trigger5 = stateno = 200 && movecontact
trigger6 = stateno = 210 && movecontact
trigger7 = stateno = 250 && movecontact
;trigger8 = stateno = 280 && movecontact
trigger8 = stateno = 220 && movecontact
trigger9 = stateno = 230 && movecontact
trigger10 = stateno = 400 && movecontact
trigger11 = stateno = 500 && movecontact

;---------------------------------------------------------------------------
;============================空中技=========================================
;---------------------------------------------------------------------------

; ジャンプ弱パンチ
[State -1]
type = ChangeState
value = 610
triggerall = var(59) = 0
triggerall = command = "x"
trigger1 = statetype = A && vel x != 0 
trigger1 = ctrl = 1
;trigger2 = stateno = 610 && movecontact; = 1

; ジャンプ弱パンチ (垂直)
[State -1]
type = ChangeState
value = 600
triggerall = var(59) = 0
triggerall = command = "x"
trigger1 = statetype = A
trigger1 = ctrl = 1
trigger2 = stateno = 600 && movecontact; = 1

; ジャンプ強パンチ
[State -1]
type = ChangeState
value = 620
triggerall = var(59) = 0
triggerall = command = "y"
trigger1 = statetype = A
trigger1 = ctrl = 1
trigger2 = stateno = 600 && movecontact; = 1
trigger3 = stateno = 610 && movecontact; = 1
trigger4 = stateno = 630 && movecontact; = 1
trigger5 = stateno = 635 && movecontact; = 1

; ジャンプ弱キック
[State -1]
type = ChangeState
value = 630
triggerall = var(59) = 0
triggerall = command = "a"
trigger1 = statetype = A && vel x != 0
trigger1 = ctrl = 1
trigger2 = stateno = 610 && movecontact; = 1
;trigger3 = stateno = 630 && movecontact; = 1

; ジャンプ弱キック (垂直)
[State -1]
type = ChangeState
value = 635
triggerall = var(59) = 0
triggerall = command = "a"
trigger1 = statetype = A
trigger1 = ctrl = 1
trigger2 = stateno = 600 && movecontact; = 1
trigger3 = stateno = 635 && movecontact; = 1

; ジャンプ強キック
[State -1]
type = ChangeState
value = 650
triggerall = var(59) = 0
triggerall = command = "b"
trigger1 = statetype = A && vel x != 0
trigger1 = ctrl = 1
trigger2 = stateno = 610 && movecontact; = 1
trigger3 = stateno = 630 && movecontact; = 1
trigger4 = stateno = 620 && movecontact; = 1

; ジャンプ強キック (垂直)
[State -1]
type = ChangeState
value = 640
triggerall = var(59) = 0
triggerall = command = "b"
trigger1 = statetype = A
trigger1 = ctrl = 1
trigger2 = stateno = 600 && movecontact; = 1
trigger3 = stateno = 635 && movecontact; = 1
trigger4 = stateno = 620 && movecontact; = 1




;=============================デバッグ========================================
[State -1, デバッグ表示1]
type = null;AppendToClipboard
trigger1 = 1
text = " Lv:%d,%d,BodyDist X=%d,Y=%d"
params = var(59),var(58),floor(P2BodyDist X),ceil(P2BodyDist Y)
ignorehitpause = 1

[State -1, デバッグ表示2]
type = null;AppendToClipboard
trigger1 = 1
text = " Edge F=%d,B=%d"
params = FrontEdgeBodyDist,BackEdgeBodyDist
ignorehitpause = 1

;---------------------------------------------------------------------------
;---------------------------------------------------------------------------
;======================ここからAI用記述=====================================
;---------------------------------------------------------------------------
;---------------------------------------------------------------------------
;====================反撃===================================================
[State -1,超爆発波]
type = ChangeState
value = 2200
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = power >= 2000
triggerall = statetype != A
triggerall = ctrl
triggerall = p2statetype != L
triggerall = Life > 75
trigger1 = P2MoveType = A
trigger1 = p2bodydist X = [0,55]
trigger1 = Random = [900,900+var(59)]
trigger2 = p2movetype != H
trigger2 = p2bodydist X = [20,60]
trigger2 = p2bodydist Y = [-100,-50]
trigger2 = Random = [900,901+var(59)]

[State -1, スラッシュアロー（弱）]
type = ChangeState
value = 1200
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = ctrl
triggerall = p2statetype != L
trigger1 = p2bodydist X = [-5,40]
trigger1 = Random = [900,900+var(59)]

[State -1,スーパーダッシュ（弱）]
type = ChangeState
value = 1500
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = ctrl
trigger1 = p2bodydist X = [-10,60]
trigger1 = Random = [905,905+(var(59)*2)]
trigger2 = p2movetype != H
trigger2 = p2bodydist X = [-25,60]
trigger2 = p2bodydist Y = [-100,-50]
trigger2 = Random = [900,904+(var(59)*4)]

[State -1,高速移動 (前方)]
type = ChangeState
value = 361
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = ctrl
triggerall = p2statetype != L
trigger1 = p2bodydist X = [-10,60]
trigger1 = Random = [910,910+(var(59)*2)]
trigger2 = p2movetype != H
trigger2 = p2bodydist X = [-25,60]
trigger2 = p2bodydist Y = [-100,-50]
trigger2 = Random = [913,916+(var(59)*4)]

[State -1,遠距離立ち弱パンチ]
type = ChangeState
value = 200
triggerall = var(59) = [1,2]
triggerall = statetype != A
triggerall = RoundState = 2
triggerall = ctrl
triggerall = P2StateType != L
triggerall = P2BodyDist X = [5,40]
triggerall = EnemyNear,AnimTime <= -5
triggerall = (PrevStateNo=[5000,5120]) || (PrevStateNo=[120,159])
triggerall = EnemyNear,ctrl = 0
trigger1 = Random = [0,14+(var(59)*10)]

[State -1, 屈み弱パンチ]
type = ChangeState
value = 410
triggerall = var(59) = [1,2]
triggerall = statetype != A
triggerall = RoundState = 2
triggerall = ctrl
triggerall = P2StateType != L
triggerall = P2BodyDist X = [-5,45]
triggerall = EnemyNear,AnimTime <= -4 
triggerall = (PrevStateNo=[5000,5120]) || (PrevStateNo=[120,159])
triggerall = EnemyNear,ctrl = 0
trigger1 = Random = [600,ifelse(P2BodyDist X<5,634+(var(59)*16),613+(var(59)*8))]

[State -1, 投げ]
Type = ChangeState
value = 800
triggerall = var(59) = [1,2]
triggerall = statetype = S
triggerall = ctrl
triggerall = p2bodydist X = [-1,6]
triggerall = (p2statetype = S) || (p2statetype = C)
triggerall = P2MoveType = A
triggerall = EnemyNear,AnimTime <= -1
trigger1 = Random  = [30,30+var(59)]

;=============================ガード========================================
[State -1, 空中ガード]
type  = ChangeState
value = 132
triggerall = inguarddist
triggerall = statetype = A
triggerall = var(59) = [1,2]
triggerall = ctrl
triggerall = stateno != [190,194]
triggerall = p2statetype = A
trigger1 = p2bodydist X = [40,80]
trigger1 = var(58) = [0,var(59)*35]
trigger2 = p2bodydist X = [-20,39]
trigger2 = var(58) = [0,var(59)*47]
trigger3 = enemy,Numproj > 0 
trigger3 = var(58) = [0,var(59)*25]

[State -1, 対地 立ちガード]
type  = ChangeState
value = 130
triggerall = inguarddist
triggerall = statetype != A
triggerall = var(59) = [1,2]
triggerall = ctrl
triggerall = stateno != [190,194]
triggerall = p2statetype = S
trigger1 = p2bodydist X = [40,90]
trigger1 = var(58) = [0,var(59)*20]
trigger2 = p2bodydist X = [-15,39]
trigger2 = var(58) = [10,var(59)*25]
trigger3 = enemy,teammode = simul
trigger3 = p2bodydist X = [-50,-16]
trigger3 = var(58) = [0,var(59)*40]
trigger4 = p2bodydist X = [-15,39]
trigger4 = enemy,hitdefattr = S, NA,SA,HA
trigger4 = Random < var(59)*150

[State -1, 対空 立ちガード]
type  = ChangeState
value = 130
triggerall = inguarddist
triggerall = statetype != A
triggerall = var(59) = [1,2]
triggerall = ctrl
triggerall = stateno != [190,194]
triggerall = p2statetype = A
trigger1 = p2bodydist X = [40,90]
trigger1 = var(58) = [0,var(59)*40]
trigger2 = p2bodydist X = [-40,39]
trigger2 = var(58) = [0,var(59)*40]
trigger3 = p2bodydist X = [-40,39]
trigger3 = enemy,hitdefattr = A, NA,SA,HA
trigger3 = Random < var(59)*300

[State -1, しゃがみガード]
type  = ChangeState
value = 131
triggerall = inguarddist
triggerall = statetype != A
triggerall = var(59) = [1,2]
triggerall = ctrl
triggerall = stateno != [190,194]
trigger1 = p2statetype = C
trigger1 = p2bodydist X = [40,85]
trigger1 = var(58) = [0,var(59)*25]
trigger2 = p2statetype = C
trigger2 = p2bodydist X = [-20,39]
trigger2 = var(58) = [0,var(59)*40]
trigger3 = p2statetype = S
trigger3 = p2bodydist X = [-15,39]
trigger3 = var(58) = [0,var(59)*15]
trigger4 = p2statetype = C
trigger4 = enemy,teammode = simul
trigger4 = p2bodydist X = [-50,-16]
trigger4 = var(58) = [0,var(59)*40]
trigger5 = p2bodydist X = [-20,39]
trigger5 = enemy,hitdefattr = C, NA,SA,HA
trigger5 = Random < var(59)*225
trigger6 = enemy,Numproj > 0 
trigger6 = var(58) = [0,var(59)*45]

;=============================投げ========================================
[State -1, 投げ]
type  = ChangeState
value = 800
triggerall = var(59) = [1,2]
triggerall = statetype = S
triggerall = ctrl
triggerall = p2bodydist X = [-1,4]
triggerall = p2statetype != A
triggerall = p2statetype != L
triggerall = p2movetype != H
trigger1 = Random  = [35,43+(var(59)*8)]

;=============================AI専用========================================
[State -1, 頭突き待機]
type  = ChangeState
value = 8000
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
trigger1 = stateno = 1460
trigger1 = AnimTime = 0
trigger1 = P2StateType = A && P2Movetype = H
trigger1 = P2Stateno != [120,152]

[State -1, エリアルへ]
type = ChangeState
value = 8040
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
trigger1 = stateno = 280
trigger1 = movehit
trigger1 = var(58) = [0,67+(var(59)*15)]

[State -1, エネルギー波待機]
type  = ChangeState
value = 8100
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = Animtime = 0
triggerall = statetype != A
trigger1 = stateno = 1000
trigger1 = p2bodydist X > 145
trigger2 = stateno = 1005
trigger2 = p2bodydist X > 235

[State -1, 追撃待機]
type  = ChangeState
value = 8200
triggerall = var(59) = [1,2]
triggerall = StateType != A
triggerall = roundstate = 2
trigger1 = stateno = 450
trigger1 = AnimTime = 0
trigger1 = MoveHit
trigger1 = var(58) = [0,33]
trigger2 = stateno = 512
trigger2 = AnimTime = 0
trigger2 = P2Movetype = H
trigger2 = P2Stateno != [120,152]
trigger2 = var(58) = [0,59]
trigger3 = stateno = 1005 || stateno = 1750
trigger3 = AnimTime = 0
trigger3 = P2BodyDist X <= 100 && FrontEdgeDist < 140
trigger3 = P2Movetype = H
trigger3 = P2Stateno != [120,152]
trigger3 = var(58) = [0,59]

;=============================超必殺技========================================
[State -1,プラネットバースト]
type = ChangeState
value = 2300
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = power >= 3000
triggerall = var(58) = [0,59+(var(59)*15)]
trigger1 = stateno = 8000
trigger1 = anim = 0
trigger1 = p2bodydist Y > -100
trigger1 = p2bodydist X > 0
trigger2 = stateno = 270
trigger2 = prevstateno = [220,230]
trigger2 = movehit
trigger3 = stateno = 220
trigger3 = (prevstateno = [200,210]) || (prevstateno = [250,260])
trigger3 = movehit
trigger3 = p2bodydist X > 30
trigger4 = stateno = 400
trigger4 = prevstateno = 420
trigger4 = movehit
trigger5 = stateno = 400
trigger5 = prevstateno = 8000
trigger5 = movehit

[State -1,超爆発波]
type = ChangeState
value = 2200
triggerall = var(59) = [1,2]
triggerall = power >= 2100
triggerall = statetype != A
triggerall = ctrl
triggerall = p2bodydist X < 80 && p2bodydist Y > -120
trigger1 = p2statetype = A && vel Y > 1
trigger1 = var(58) = [90,91]
trigger2 = p2life < 150
trigger2 = random = [400,439+(var(59)*30)]
trigger2 = p2statetype != L
trigger2 = p2movetype != H

[State -1,ギャリック砲]
type = ChangeState
value = 2000
triggerall = var(59) = [1,2]
triggerall = power >= 1100
triggerall = statetype != A
trigger1 = stateno = 8000
trigger1 = anim = 0
trigger1 = p2bodydist Y > -100
trigger1 = p2bodydist X > 0
trigger1 = var(58) = [0,29+(var(59)*10)]
trigger2 = stateno = 270
trigger2 = prevstateno = [220,230]
trigger2 = movehit
trigger2 = var(58) = [0,15+(var(59)*7)]
trigger3 = stateno = 220
trigger3 = (prevstateno = [200,210]) || (prevstateno = [250,260])
trigger3 = movehit
trigger3 = p2bodydist X > 30
trigger3 = var(58) = [0,15+(var(59)*7)]
trigger4 = stateno = 400
trigger4 = prevstateno = 420
trigger4 = movehit
trigger4 = var(58) = [0,15+(var(59)*7)]
trigger5 = stateno = 400
trigger5 = prevstateno = 8000
trigger5 = movehit
trigger5 = var(58) = [0,29+(var(59)*10)]
trigger6 = stateno = 8100
trigger6 = time > 5
trigger6 = P2MoveType = H && P2StateNo != [120,155]
trigger6 = var(58) = [0,29+(var(59)*10)]
trigger7 = ctrl
trigger7 = p2bodydist x > 120 && p2bodydist Y > -30
trigger7 = enemy,Numproj > 0 && !inguarddist
trigger7 = var(58) = [0,1+(P2BodyDist X/(60-(var(59)*15)))]

[State -1,空中ギャリック砲]
type = ChangeState
value = 2100
triggerall = var(59) = [1,2]
triggerall = power >= 1100
trigger1 = ctrl
trigger1 = p2bodydist x > 120 && (p2bodydist Y = [-17,17])
trigger1 = enemy,Numproj > 0 && !inguarddist
trigger1 = var(58) = [0,1+(P2BodyDist X/(60-(var(59)*15)))]

;=============================必殺技========================================
[State -1,ダッシュボム]
type = ChangeState
value = 1700
triggerall = var(59) = [1,2]
trigger1 = stateno = 400 && movehit
trigger1 = prevstateno = 8000
trigger1 = var(58) = [0,60+(var(59)*12)]
trigger2 = stateno = 270
trigger2 = prevstateno = [220,230]
trigger2 = movehit
trigger2 = var(58) = [0,4+(var(59)*5)]
trigger3 = stateno = 220
trigger3 = (prevstateno = [200,210]) || (prevstateno = [250,260])
trigger3 = movehit
trigger3 = p2bodydist X > 30
trigger3 = var(58) = [0,4+(var(59)*5)]
trigger4 = stateno = 400
trigger4 = prevstateno = 420
trigger4 = movehit
trigger4 = var(58) = [0,4+(var(59)*5)]

[State -1,スラッシュアロー（弱）]
type = ChangeState
value = 1200
triggerall = var(59) = [1,2]
triggerall = statetype != A
trigger1 = ctrl
trigger1 = p2bodydist X < 60 && p2bodydist Y > -75
trigger1 = p2statetype = A && vel Y > 0
trigger1 = var(58) = [80,81]
trigger2 = stateno = 550
trigger2 = P2StateNo = [5070,5079]
trigger2 = movehit = [3,12-var(59)]
trigger2 = var(58) = [0,MoveHit*3.5]

[State -1,スラッシュアロー（強）]
type = ChangeState
value = 1250
triggerall = var(59) = [1,2]
triggerall = statetype != A
trigger1 = stateno = 8000
trigger1 = p2bodydist Y > -100
trigger1 = p2bodydist X > 0
trigger1 = var(58) = [0,35+(var(59)*7)]
trigger2 = stateno = 400
trigger2 = prevstateno = 420
trigger2 = movehit
trigger2 = var(58) = [67,71+(var(59)*4)]
trigger3 = stateno = 550
trigger3 = P2StateNo != [5070,5079]
trigger3 = movehit = [5,16-var(59)]
trigger3 = var(58) = [0,MoveHit*6.5]

[State -1,連続エネルギー弾（弱）]
type = ChangeState
value = 1000
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = power >= 100
triggerall = numproj = 0
triggerall = statetype != A
trigger1 = ctrl
trigger1 = p2bodydist X > 150
trigger1 = var(58) = [80,82]
trigger2 = stateno = 270
trigger2 = prevstateno = [220,230]
trigger2 = movehit
trigger2 = var(58) = [0,25+(var(59)*7)]
trigger3 = stateno = 220
trigger3 = movecontact
trigger3 = p2bodydist X > 30
trigger3 = var(58) = [0,25+(var(59)*7)]
trigger4 = stateno = 400
trigger4 = movecontact
trigger4 = var(58) = [0,25+(var(59)*6)]
trigger5 = ctrl
trigger5 = Life < 225
trigger5 = p2bodydist X > 150
trigger5 = random < p2bodydist X*(.3+(var(59)*.1))
trigger6 = stateno = 8100
trigger6 = Life < 225
trigger6 = time > 5
trigger6 = p2bodydist X > 180
trigger6 = var(58) = [0,50+(var(59)*8)]
trigger7 = (stateno = 106) || (stateno = 360)
trigger7 = (Life < 225) && (p2bodydist X > 165)
trigger7 = AnimTime = 0
trigger7 = var(58) = [0,35+(var(59)*7)]
trigger8 = stateno = 400
trigger8 = prevstateno = 420
trigger8 = movecontact
trigger8 = var(58) = [57,60+(var(59)*3)]
trigger9 = stateno = 230 && prevstateno = 500
trigger9 = MoveContact
trigger9 = var(58) = [ifelse(MoveGuarded,85,90),90+(var(59)*2)]

[State -1,エネルギー弾（強)]
type = ChangeState
value = 1005
triggerall = var(59) = [1,2]
triggerall = power >= 100
triggerall = numproj = 0 || Numprojid(1000) = 2 || Numprojid(1005) = 0
triggerall = stateno = 1000 && AnimElem = 9, >= 1 && AnimElem = 11, <= 1
trigger1 = var(58) = [0,65+(var(59)*7)]
trigger1 = p2bodydist X < 100
trigger2 = var(58) = [0,39+(var(59)*5)]
trigger2 = p2bodydist X >= 100

[State -1,空中連続エネルギー弾（弱）]
type = ChangeState
value = 1100
triggerall = var(59) = [1,2]
triggerall = power >= 100
triggerall = numproj = 0
triggerall = statetype = A
trigger1 = ctrl
trigger1 = p2bodydist X > 150
trigger1 = random = [800,816+(var(59)*4)]

[State -1,空中エネルギー弾（強）]
type = ChangeState
value = 1105
triggerall = var(59) = [1,2]
triggerall = power >= 100
triggerall = numproj = 0 || Numprojid(1100) = 2 || Numprojid(1105) = 0
triggerall = stateno = 1100 && AnimElem = 9, >= 1 && AnimElem = 11, <= 1
trigger1 = var(58) = [0,39+(var(59)*5)]

[State -1,ジャンピングアロー]
type = ChangeState
value = 1300
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = ctrl
trigger1 = p2bodydist x < 160
trigger1 = random = [700,700+(P2BodyDist X/30)]
trigger2 = p2bodydist x >= 160
trigger2 = random = [700,740]

[State -1,フライングアロー（強）]
type = ChangeState
value = 1450
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = ctrl
trigger1 = p2bodydist x > 75
trigger1 = var(58) = [70,72]
trigger2 = enemy,Numproj > 0
trigger2 = var(58) = [0,14+(var(59)*5)]

[State -1,フライングアロー（弱）]
type = ChangeState
value = 1400
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = ctrl
trigger1 = Enemy,FrontEdgeDist < 155
trigger1 = p2bodydist x > 60
trigger1 = var(58) = [73,74]

[State -1,空中フライングアロー（弱）]
type = ChangeState
value = 1800
triggerall = var(59) = [1,2]
trigger1 = statetype = A
trigger1 = ctrl
trigger1 = p2bodydist X < 100
trigger1 = stateno = 50 && time = 20
trigger1 = var(58) = [70,79]
trigger2 = stateno = 1303
trigger2 = var(58) = [0,24+(var(59)*5)]
trigger3 = stateno = 630
trigger3 = prevstateno = 610
trigger3 = movecontact
trigger3 = var(58) = [0,79+(var(59)*5)]

[State -1,空中フライングアロー（強）]
type = ChangeState
value = 1850
triggerall = var(59) = [1,2]
trigger1 = statetype = A
trigger1 = ctrl
trigger1 = p2bodydist X >= 100
trigger1 = stateno = 50 && time = 20
trigger1 = var(58) = [70,79]
trigger2 = stateno = 1303
trigger2 = var(58) = [35,59+(var(59)*5)]

[State -1,スーパーダッシュ（弱）]
type = ChangeState
value = 1500
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
trigger1 = ctrl
trigger1 = p2bodydist x = [60,85]
trigger1 = var(58) = [75,76]
trigger2 = stateno = 270
trigger2 = prevstateno = [220,230]
trigger2 = moveguarded
trigger2 = var(58) = [0,24]
trigger3 = stateno = 220
trigger3 = (prevstateno = [200,210]) || (prevstateno = [250,260])
trigger3 = moveguarded
trigger3 = p2bodydist X > 30
trigger3 = var(58) = [0,24]
trigger4 = stateno = 400
trigger4 = prevstateno = 420
trigger4 = moveguarded
trigger4 = var(58) = [60,69]
trigger5 = stateno = 400
trigger5 = movecontact
trigger5 = var(58) = [70,79]
trigger6 = stateno = 450
trigger6 = prevstateno = 420
trigger6 = moveguarded
trigger6 = var(58) = [50,54]
trigger7 = stateno = 450
trigger7 = movecontact
trigger7 = var(58) = [55,64]
trigger8 = ctrl
trigger8 = BackEdgeBodyDist <= 30
trigger8 = P2BodyDist X <= 50
trigger8 = var(58) = [12,23]
trigger9 = stateno = 230 && prevstateno = 500
trigger9 = MoveGuarded
trigger9 = var(58) = [30,44]

[State -1,スーパーダッシュ（強）]
type = ChangeState
value = 1510
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
trigger1 = ctrl
trigger1 = p2bodydist x = [130,160]
trigger1 = var(58) = [75,76]
trigger2 = stateno = 270
trigger2 = prevstateno = [220,230]
trigger2 = moveguarded
trigger2 = var(58) = [25,49]
trigger3 = stateno = 220
trigger3 = (prevstateno = [200,210]) || (prevstateno = [250,260])
trigger3 = moveguarded
trigger3 = p2bodydist X > 30
trigger3 = var(58) = [25,49]
trigger4 = stateno = 400
trigger4 = prevstateno = 420
trigger4 = moveguarded
trigger4 = var(58) = [80,89]
trigger5 = stateno = 400
trigger5 = movecontact
trigger5 = var(58) = [90,99]
trigger6 = stateno = 450
trigger6 = prevstateno = 420
trigger6 = moveguarded
trigger6 = var(58) = [0,33]
trigger7 = stateno = 450
trigger7 = movecontact
trigger7 = var(58) = [34,49]
trigger8 = ctrl
trigger8 = BackEdgeBodyDist <= 30
trigger8 = P2BodyDist X <= 50
trigger8 = var(58) = [24,35]
trigger9 = stateno = 230 && prevstateno = 500
trigger9 = MoveGuarded
trigger9 = var(58) = [45,59]

[State -1, ドライビングエルボー]
type = ChangeState
value = 1600
triggerall = var(59) = [1,2]
triggerall = animelem = 2, >= 1
triggerall = stateno = [1500,1510]
triggerall = statetime > 12
triggerall = P2StateType != L
trigger1 = p2dist x = [10,20]
trigger1 = var(58) = [0,39]
trigger2 = p2dist x = [-15,-5]
trigger2 = var(58) = [40,79]

[State -1,ダッシュ強パンチ (ニュートラル)]
type = ChangeState
value = 510
triggerall = var(59) = [1,2]
trigger1 = power < 3000
trigger1 = stateno = 8000
trigger1 = anim = 12
trigger1 = p2bodydist X > 0
trigger1 = var(58) = [50,79+(var(59)*5)]
trigger2 = stateno = 270
trigger2 = prevstateno = [220,230]
trigger2 = movehit
trigger2 = var(58) = [40,79+(var(59)*5)]
trigger3 = stateno = 220
trigger3 = (prevstateno = [200,210]) || (prevstateno = [250,260])
trigger3 = movehit
trigger3 = p2bodydist X > 30
trigger3 = var(58) = [40,79+(var(59)*5)]
trigger4 = stateno = 400
trigger4 = prevstateno = 420
trigger4 = movehit
trigger4 = var(58) = [38,50+(var(59)*3)]

;============================通常技=========================================
[State -1,弱パンチ]
type = ChangeState
value = ifelse(P2BodyDist X < 4,210,200)
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = p2bodydist x = [-4,34]
triggerall = statetype = S
triggerall = ctrl = 1
trigger1 = random = [0,ifelse(p2movetype = A,3+(var(59)*13),9+(var(59)*90))]
trigger1 = P2StateType != L
trigger2 = var(58) = [0,7+(var(59)*7)]
trigger2 = p2stateno != [120,159]
trigger2 = p2statetype != L
trigger2 = p2movetype = H
trigger3 = p2movetype = I
trigger3 = p2statetype != L
trigger3 = enemynear,ctrl = 0
trigger3 = ctrl
trigger3 = var(58) = [0,7+(var(59)*7)]

[State -1,弱キック (近距離)]
type = ChangeState
value = 260
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = p2bodydist x < 5
triggerall = statetype = S
trigger1 = p2bodydist x = [-5,5]
trigger1 = random = [300,ifelse(p2movetype = A,303+(var(59)*11),309+(var(59)*40))]
trigger1 = p2statetype != L
trigger1 = ctrl = 1
trigger2 = var(58) = [22,22+(var(59)*11)]
trigger2 = p2stateno != [120,159]
trigger2 = p2statetype != L
trigger2 = p2movetype = H
trigger2 = ctrl = 1
trigger3 = stateno = [200,210]
trigger3 = movecontact
trigger3 = var(58) = [0,74+(var(59)*10)]
trigger4 = p2movetype = I
trigger4 = p2statetype != L
trigger4 = enemynear,ctrl = 0
trigger4 = ctrl
trigger4 = var(58) = [22,22+(var(59)*11)]

[State -1,弱キック]
type = ChangeState
value = 250
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = statetype = S
trigger1 = stateno = [200,210]
trigger1 = movecontact
trigger1 = var(58) = [0,74+(var(59)*10)]
trigger1 = p2bodydist x <= 12

[State -1,強パンチ (近距離)]
type = ChangeState
value = 230
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = p2bodydist x < 15
trigger1 = stateno = 500 && movecontact
trigger1 = var(58) = [0,74+(var(59)*10)]

[State -1,強パンチ]
type = ChangeState
value = 220
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = p2bodydist x < 55
trigger1 = statetype = S
trigger1 = ctrl = 1
trigger1 = random = [900,905+(var(59)*7)]
trigger2 = stateno = [250,260] 
trigger2 = movecontact
trigger2 = prevstateno = [200,210]
trigger2 = var(58) = [0,74+(var(59)*10)]
trigger3 = stateno = [200,210]
trigger3 = movecontact
trigger3 = var(58) = [0,74+(var(59)*10)]
trigger3 = p2bodydist x > 12

[State -1,強キック (近距離)]
type = ChangeState
value = 280
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = p2bodydist x < 25
trigger1 = stateno = 260
trigger1 = movecontact
trigger1 = var(58) = [0,ifelse(MoveHit,ifelse(PrevStateNo=210,74+(var(59)*10),64+(var(59)*5)),54-(var(59)*10))]
trigger2 = stateno = 230 && prevstateno = 500
trigger2 = movecontact
trigger2 = var(58) = [0,ifelse(MoveHit,74+(var(59)*10),44-(var(59)*10))]

[State -1,強キック]
type = ChangeState
value = 270
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
trigger1 = stateno = 220 && movecontact
trigger1 = (prevstateno = [200,210]) || (prevstateno = [250,260])
trigger1 = var(58) = [0,74+(var(59)*10)]
trigger1 = p2bodydist X < 30
trigger2 = stateno = 220 && movecontact
trigger2 = prevstateno != [250,260]
trigger2 = var(58) = [50,69+(var(59)*5)]

;============================しゃがみ=========================================
[State -1,しゃがみ弱キック]
type = ChangeState
value = 420
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = statetype != A
triggerall = p2bodydist x < 33
trigger1 = random = [600,ifelse(p2movetype = A,630+(var(59)*15),609+(var(59)*70))]
trigger1 = p2statetype != L && P2StateType != A
trigger1 = p2movetype != A
trigger1 = ctrl
trigger2 = p2stateno != [120,159]
trigger2 = p2statetype != L && p2statetype != A
trigger2 = p2movetype = H
trigger2 = ctrl
trigger2 = var(58) = [50,79+(var(59)*5)]
trigger3 = p2movetype = I
trigger3 = p2statetype != L && p2statetype != A
trigger3 = enemynear,ctrl = 0
trigger3 = ctrl
trigger3 = var(58) = [50,79+(var(59)*5)]

[State -1,しゃがみ強パンチ]
type = ChangeState
value = 400
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
trigger1 = p2bodydist x < 32
trigger1 = (stateno = [410,420]) && movecontact
trigger1 = var(58) = [0,74+(var(59)*10)]
trigger2 = stateno = 8000
trigger2 = NumTarget
trigger2 = Target,Vel Y > 0
trigger2 = (-P2BodyDist Y)/(Target,Vel Y) < 22
trigger2 = P2BodyDist X < 0
trigger2 = var(58) = [10*(((-P2BodyDist Y)/(Target,Vel Y))-12),99]

[State -1,しゃがみ強キック]
type = ChangeState
value = 450
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = statetype != A
trigger1 = stateno = 400
trigger1 = movecontact
trigger1 = var(58) = [40,79+(var(59)*5)]
trigger1 = p2statetype != A
trigger2 = p2bodydist x = [34,70]
trigger2 = random = [600,605+(var(59)*17)]
trigger2 = p2statetype != L
trigger2 = p2movetype != A
trigger2 = ctrl
trigger3 = stateno = 230 && prevstateno = 500
trigger3 = MoveGuarded
trigger3 = var(58) = [60,69]
trigger4 = p2bodydist x >= 32
trigger4 = (stateno = [410,420]) && movecontact
trigger4 = var(58) = [0,69+(var(59)*10)]

;============================空中技=========================================
[State -1,ジャンプ弱パンチ]
type = ChangeState
value = 610
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = stateno != 105
trigger1 = statetype = A && vel x != 0 
trigger1 = stateno = 8050
trigger1 = pos y < -50

[State -1,ジャンプ弱キック]
type = ChangeState
value = ifelse(vel x = 0,635,630)
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = statetype = A
triggerall = stateno != 105
trigger1 = stateno = 610
trigger1 = movecontact
trigger1 = var(58) = [0,87+(var(59)*5)]
trigger2 = ctrl
trigger2 = P2StateType = A
trigger2 = P2BodyDist X = [-5,25]
trigger2 = P2BodyDist Y = [-15,15]
trigger2 = var(58) = [0,66]

[State -1,ジャンプ強パンチ]
type = ChangeState
value = 620
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = statetype = A
triggerall = stateno != 105
trigger1 = ctrl = 1
trigger1 = pos Y > -90 && vel Y > 0
trigger1 = var(58) = [0,39]
trigger2 = stateno = [630,635]
trigger2 = movecontact
trigger2 = var(58) = [0,ifelse(MoveHit,64+(var(59)*10),59-(var(59)*10))]

[State -1,ジャンプ強キック]
type = ChangeState
value = ifelse(vel x = 0,640,650)
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = statetype = A
triggerall = stateno != 105
trigger1 = ctrl = 1
trigger1 = pos Y > -100 && vel Y > 0
trigger1 = var(58) = [40,79]
trigger2 = stateno = 620
trigger2 = PrevStateNo = [630,635]
trigger2 = movecontact
trigger2 = var(58) = [0,ifelse(MoveHit,69+(var(59)*10),59-(var(59)*10))]

;=======================ダッシュ攻撃========================================
[State -1,ダッシュ強パンチ (ダッシュ中)]
type = ChangeState
value = 511
triggerall = stateno = 101
triggerall = var(59) = [1,2]
trigger1 = p2bodydist x = [140,190]
trigger1 = p2statetype != L
trigger1 = var(58) = [80,89]

[State -1,ダッシュ弱パンチ (ダッシュ中)]
type = ChangeState
value = 500
triggerall = stateno = 101
triggerall = var(59) = [1,2]
trigger1 = p2bodydist x < 50
trigger1 = p2statetype != L
trigger1 = var(58) = [0,46]
 
[State -1,ダッシュ弱キック (スライディングキック)]
type = ChangeState
value = 550
triggerall = stateno = 101
triggerall = var(59) = [1,2]
trigger1 = p2bodydist x = [80,100]
trigger1 = var(58) = [85,94]
trigger1 = p2statetype != L
trigger2 = P2StateType = L && p2stateno != 5120
trigger2 = P2BodyDist X < 100

;============================特殊技=========================================
[State -1, ジャンプ開始]
type = ChangeState
value = 40
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = p2bodydist X > 160
triggerall = statetype = S
triggerall = Random < p2bodydist X
triggerall = ctrl
trigger1 = p2statetype = L
trigger2 = enemy, numproj >= 1

[State -1, 前にジャンプ]
type = VarSet
triggerall = var(59) = [1,2]
triggerall = Random < (p2bodydist X) * 4
trigger1 = stateno = 40
sysvar(1)  = 1

[State -1, ダッシュ]
type = ChangeState
value = 100
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = enemy,Numproj= 0
trigger1 = p2bodydist X > 45
trigger1 = p2statetype != L && p2movetype != A
trigger1 = ctrl
trigger1 = Random = [400,400+(p2bodydist X*0.2)]
trigger2 = stateno = 8100
trigger2 = Life >= 225
trigger2 = time > 5
trigger2 = p2bodydist X < 180
trigger2 = var(58) = [70,99]
trigger3 = stateno = 8200
trigger3 = var(58) = [0,statetime*10]

[State -1, 空中ダッシュ]
type = ChangeState
value = 110
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype = A
trigger1 = ctrl
trigger1 = p2bodydist X > 100 && vel Y = 0
trigger1 = var(58) = [10,13]

[State -1, バックステップ]
type = ChangeState
value = 105
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = ctrl
triggerall = BackEdgeBodyDist > 30
trigger1 = p2stateno = 5120
trigger1 = var(58) = [0,ifelse(life>225,24,33)]
trigger2 = P2BodyDist X > 30
trigger2 = Life < 225
trigger2 = var(58) = [0,17]
trigger3 = stateno = 8100
trigger3 = Life < 225
trigger3 = time > 5
trigger3 = p2bodydist X <= 180
trigger3 = var(58) = [0,33]
trigger4 = (stateno = 106) || (stateno = 360)
trigger4 = (Life < 225) && (p2bodydist X <= 165)
trigger4 = AnimTime = 0
trigger4 = var(58) = [0,33]

[State -1,高速移動 (後方)]
type = ChangeState
value = 360
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = BackEdgeBodyDist > 30
trigger1 = ctrl
trigger1 = Var(58) = 15
trigger2 = ctrl
trigger2 = p2stateno = 5120
trigger2 = var(58) = [50,ifelse(life>225,74,83)]
trigger3 = ctrl
trigger3 = P2BodyDist X > 30
trigger3 = Life < 225
trigger3 = var(58) = [20,37]
trigger4 = stateno = 8100
trigger4 = Life < 225
trigger4 = time > 5
trigger4 = p2bodydist X <= 180
trigger4 = var(58) = [50,83]
trigger5 = (stateno = 106) || (stateno = 360)
trigger5 = (Life < 225) && (p2bodydist X <= 165)
trigger5 = AnimTime = 0
trigger5 = var(58) = [50,83]
trigger6 = stateno = 101
trigger6 = P2StateType = L && p2stateno = 5120
trigger6 = P2BodyDist X < 100
trigger6 = var(58) = [50,74]

[State -1,高速移動 (前方)]
type = ChangeState
value = 361
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
trigger1 = ctrl
trigger1 = Var(58) = 16
trigger2 = ctrl
trigger2 = enemy,Numproj > 0 
trigger2 = var(58) = [25,49]
trigger3 = ctrl
trigger3 = BackEdgeBodyDist <= 30
trigger3 = P2BodyDist X <= 50
trigger3 = var(58) = [0,11]
trigger4 = stateno = 101
trigger4 = P2StateType = L && p2stateno = 5120
trigger4 = P2BodyDist X < 60
trigger4 = var(58) = [0,24]
trigger5 = stateno = 101
trigger5 = P2BodyDist X < 50
trigger5 = P2StateType != L
trigger5 = var(58) = [47,79]

[State -1,きたねぇ花火（カウンター）]
type = ChangeState
value = 305
triggerall = var(59) = [1,2]
triggerall = stateno = [150,153]
triggerall = power >= 1000
trigger1 = power >= 1500
trigger1 = power < 2800
trigger1 = random = [500,500+(var(59)*2)]
trigger2 = power >= 1500
trigger2 = BackEdgeBodyDist <= 30
trigger2 = random = [0,1+(var(59)*3)]
trigger3 = p2life/((Enemy,Const(data.defence))*.01) < 140*((Const(data.attack))*.01)
trigger3 = random = [300,374-(P2Life*.5)]

[State -1,挑発]
type = ChangeState
value = 195
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = Vel X = 0
triggerall = stateno != 195
triggerall = statetype != A
triggerall = Life > 250
triggerall = enemy,Numproj= 0
trigger1 = ctrl
trigger1 = p2bodydist X > 200
trigger1 = Life-P2Life > 250
trigger1 = Random = [777,777+((Life-P2Life)*(.045-(var(59)*.15)))]
trigger2 = stateno = 512
trigger2 = Animtime = 0
trigger2 = p2stateno = [5030,5110]
trigger2 = p2bodydist X > 80
trigger2 = Life-P2Life > 225
trigger2 = var(58) = [0,5-var(59)+(Life-P2Life)*.1]
trigger3 = stateno = 1600 && MoveHit
trigger3 = Animtime = 0
trigger3 = p2bodydist X > 145
trigger3 = Life-P2Life > 225
trigger3 = var(58) = [0,11-(var(59)*4)+(Life-P2Life)*.1]
trigger4 = stateno = 1750
trigger4 = Animtime = 0
trigger4 = FrontEdgeDist > 160
trigger4 = Life-P2Life > 225
trigger4 = var(58) = [0,15-(var(59)*6)+(Life-P2Life)*.1]
trigger5 = stateno = 1005 || stateno = 2000
trigger5 = AnimTime = 0
trigger5 = p2bodydist X > 145
trigger5 = P2Movetype = H && P2Stateno != [120,152]
trigger5 = var(58) = [0,15-(var(59)*6)+(Life-P2Life)*.1]

[State -1,気力溜め]
type = ChangeState
value = 1900
triggerall = var(59) = [1,2]
triggerall = roundstate = 2
triggerall = statetype != A
triggerall = Power < 3000
triggerall = ctrl = 1
triggerall = enemy,Numproj= 0
trigger1 = p2bodydist X > 35
trigger1 = p2statetype = L
trigger1 = Life > 250
trigger1 = Var(58) = [50,52]
trigger2 = p2bodydist X > 150
trigger2 = Var(58) = [50,79]
trigger3 = Power < 1500
trigger3 = Life > 250
trigger3 = p2bodydist X = [100,149]
trigger3 = Var(58) = [50,69]

[State -1, 気力溜め中止]
type = ChangeState
value = 1901
triggerall = var(59) = [1,2]
triggerall = stateno = 1900
trigger1 = p2bodydist X < 85
trigger1 = p2statetype != L || P2StateNo = 5120
trigger2 = enemy,Numproj > 0 
trigger3 = p2movetype = A
trigger3 = Var(58) = [0,84]
trigger4 = p2bodydist X < 120
trigger4 = Vel X > 0
trigger5 = random < statetime/10
trigger6 = roundstate != 2
trigger7 = inguarddist
trigger7 = Var(58) = [0,89]
trigger8 = Life < 250 && Power > 1250
trigger8 = random < statetime

[State -1, ガード2]
type = ChangeState
value = 120
triggerall = var(59) = [1,2]
triggerall = alive = 1
triggerall = inguarddist
trigger1 = ctrl
trigger1 = var(58) = [80-(var(59)*20),99]

[State -1, CPU用オートターン]
type = Turn
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
trigger1   = P2BodyDist X < -200
trigger1   = statetype != A
trigger1   = stateno = [200,440]
trigger1   = Time = 1

[State -1, 地上受身]
type = ChangeState
value = 5200
triggerall = stateno = 5050
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = vel Y > 0
triggerall = alive
triggerall = canrecover
triggerall = pos Y < ifelse((anim = [5051,5059])||(anim = [5061,5069]), 0, 25)
triggerall = pos Y >= -20
trigger1   = Random < 50
trigger2   = var(58) = [20,39]
trigger2   = enemy,hitdefattr = SC, AA, AT, AP

[State -1, 空中受身]
type = ChangeState
value = 5210
triggerall = stateno = 5050
triggerall = roundstate = 2
triggerall = var(59) = [1,2]
triggerall = vel Y > -1
triggerall = alive
triggerall = canrecover
triggerall = pos Y = [-120,-20)
trigger1   = Random < 30
trigger2   = P2BodyDist X = [-90,90]
trigger2   = var(58) = [30,39]
trigger2   = enemy,hitdefattr = SA, AA, AT, AP


;=============================ＡＩスイッチ========================================
[State -1, AI起動用ヘルパー]
type=helper
triggerall = !NumHelper(9741)
triggerall = roundstate=2 && alive
triggerall = var(59) = 0
triggerall = ctrl && stateno=0
trigger1 = (PrevStateNo=[191,194]) || PrevStateNo=196
trigger2 = PrevStateNo=5900
helpertype=normal
name="AI switch"
stateno=9741
ID=9741
pos=9999,9999
keyctrl=1
pausemovetime=2147483647
supermovetime=2147483647
persistent = 0

[State -1, AIhelper]
type=changestate
trigger1= ishelper(9741)
trigger1= stateno!=9741
value=9741

[State -1, Random_AIvar]
type     = VarRandom
trigger1 = stateno != [120,155]
trigger1 = Time = 1
trigger2 = stateno = [0,99]
trigger2 = statetime = 10
v     = 58
range = 0,99

[State -1, AI Level]
type     = VarSet
triggerall = !var(59)
triggerall=RoundState = 2
trigger1 = (command="cpu1")||(command="cpu2")
trigger2 = (command="cpu3")||(command="cpu4")
trigger3 = (command="cpu5")||(command="cpu6")
trigger4 = (command="cpu7")||(command="cpu8")
trigger5 = (command="cpu9")||(command="cpu10")
trigger6 = (command="cpu11")||(command="cpu12")
trigger7 = (command="cpu13")||(command="cpu14")
trigger8 = (command="cpu15")||(command="cpu16")
trigger9 = (command="cpu17")||(command="cpu18")
trigger10 = (command="cpu19")||(command="cpu20")
trigger11 = (command="cpu21")||(command="cpu22")
trigger12 = (command="cpu23")||(command="cpu24")
trigger13 = (command="cpu25")||(command="cpu26")
trigger14 = (command="cpu27")||(command="cpu28")
trigger15 = (command="cpu29")||(command="cpu30")
trigger16 = NumHelper(9741)
trigger16 = Helper(9741),var(59)
var(59) = 1 ; AI Level 0-2
;0 = AIなし
;1 = Normal
;2 = Hard
