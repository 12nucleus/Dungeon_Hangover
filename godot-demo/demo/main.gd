extends Node3D
## Dungeon Hangover — Godot demo
## "The Mother Rat's Lair": a voxel-built hero fights a Mother Rat boss and
## her pups in a simple turn-based combat loop. Everything (room, models,
## lights, HUD) is built from code with real voxel-style materials.

# ─────────────────────────────────────────────────────────────
# combat state
# ─────────────────────────────────────────────────────────────
const TILE := 1.0
const ROOM_MIN := 1
const ROOM_MAX := 12

var player_hp := 24
var player_max := 24
var player_tile := Vector2i(2, 2)
var player_moves := 4
var attacked_this_turn := false

var phase := "player"            # player / enemy / won / lost
var enemies: Array = []          # dicts: node, tile, hp, max_hp, kind, alive
var enemy_idx := 0
var enemy_timer := 0.0
var log_line := "The Mother Rat eyes you from her nest of bones and pups."

# camera orbit
var cam_yaw := 0.0
var cam_pitch := 0.9
var cam_distance := 16.0

# nodes
var cam: Camera3D
var player_node: Node3D
var player_hp_label: Label3D
var hud: Label


# ─────────────────────────────────────────────────────────────
func _ready() -> void:
	_setup_world()
	_build_room()
	_build_player()
	_build_enemies()
	_setup_hud()
	_update_hud()


# ─────────────────────────────────────────────────────────────
# world: camera + lights + environment
# ─────────────────────────────────────────────────────────────
func _setup_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.03, 0.02, 0.05)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.4, 0.36, 0.5)
	env.ambient_light_energy = 0.6
	env.fog_enabled = true
	env.fog_density = 0.02
	env.fog_light_color = Color(0.08, 0.06, 0.10)
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-55, -35, 0)
	key.light_energy = 0.7
	key.light_color = Color(0.95, 0.9, 0.8)
	key.shadow_enabled = true
	add_child(key)

	cam = Camera3D.new()
	cam.fov = 50
	add_child(cam)


# ─────────────────────────────────────────────────────────────
# room: floor, walls, torches, rat's nest, scattered bones
# ─────────────────────────────────────────────────────────────
func _build_room() -> void:
	var room := Node3D.new()
	add_child(room)

	var floor := _box(Vector3(7, -0.5, 7), Vector3(13.4, 1.0, 13.4), Color(0.16, 0.15, 0.14))
	room.add_child(floor)

	# subtle floor checker for grid readability
	for x in range(ROOM_MIN, ROOM_MAX + 1):
		for z in range(ROOM_MIN, ROOM_MAX + 1):
			if (x + z) % 2 == 0:
				room.add_child(_box(_tile_to_world(Vector2i(x, z)) + Vector3(0, 0.005, 0), Vector3(0.94, 0.02, 0.94), Color(0.17, 0.16, 0.15)))

	# walls
	for x in range(0, ROOM_MAX + 2):
		room.add_child(_box(Vector3(x, 1.0, 0), Vector3(1.0, 2.0, 1.0), Color(0.22, 0.20, 0.18)))
		room.add_child(_box(Vector3(x, 1.0, ROOM_MAX + 1), Vector3(1.0, 2.0, 1.0), Color(0.22, 0.20, 0.18)))
	for z in range(0, ROOM_MAX + 2):
		room.add_child(_box(Vector3(0, 1.0, z), Vector3(1.0, 2.0, 1.0), Color(0.22, 0.20, 0.18)))
		room.add_child(_box(Vector3(ROOM_MAX + 1, 1.0, z), Vector3(1.0, 2.0, 1.0), Color(0.22, 0.20, 0.18)))

	# wall torches
	_add_torch(room, Vector3(0.5, 1.7, 3.0))
	_add_torch(room, Vector3(0.5, 1.7, 9.0))
	_add_torch(room, Vector3(12.5, 1.7, 6.0))

	# the nest — a ring of straw in the corner
	for i in 12:
		var a := TAU * i / 12.0
		var npos := _tile_to_world(Vector2i(9, 5)) + Vector3(cos(a) * 1.1, 0.1, sin(a) * 1.1)
		room.add_child(_box(npos, Vector3(0.4, 0.2, 0.4), Color(0.45, 0.38, 0.2)))

	# scattered bones
	for b in [Vector3(4, 0.05, 9), Vector3(5, 0.05, 10), Vector3(9, 0.05, 3), Vector3(3, 0.05, 5)]:
		room.add_child(_box(b, Vector3(0.5, 0.1, 0.12), Color(0.85, 0.82, 0.72)))


func _add_torch(parent: Node3D, pos: Vector3) -> void:
	parent.add_child(_box(pos + Vector3(0, -0.2, 0), Vector3(0.08, 0.6, 0.08), Color(0.3, 0.2, 0.1)))
	parent.add_child(_box(pos + Vector3(0, 0.25, 0), Vector3(0.16, 0.3, 0.16), Color(1.0, 0.6, 0.15), true))
	var light := OmniLight3D.new()
	light.position = pos + Vector3(0, 0.4, 0)
	light.light_color = Color(1.0, 0.55, 0.2)
	light.light_energy = 2.2
	light.omni_range = 5.0
	parent.add_child(light)


# ─────────────────────────────────────────────────────────────
# units
# ─────────────────────────────────────────────────────────────
func _build_player() -> void:
	player_node = Node3D.new()
	add_child(player_node)
	var p := player_node
	p.add_child(_box(Vector3(0, 0.35, 0), Vector3(0.5, 0.7, 0.3), Color(0.85, 0.65, 0.45)))     # torso (skin)
	p.add_child(_box(Vector3(0, 0.1, 0), Vector3(0.4, 0.2, 0.3), Color(0.95, 0.95, 0.95)))     # underwear
	p.add_child(_box(Vector3(-0.12, 0.0, 0), Vector3(0.16, 0.1, 0.2), Color(0.8, 0.6, 0.4)))   # leg
	p.add_child(_box(Vector3(0.12, 0.0, 0), Vector3(0.16, 0.1, 0.2), Color(0.8, 0.6, 0.4)))    # leg
	p.add_child(_box(Vector3(0, 0.85, 0), Vector3(0.32, 0.3, 0.3), Color(0.9, 0.7, 0.5)))      # head
	p.add_child(_box(Vector3(0, 1.05, 0), Vector3(0.3, 0.1, 0.3), Color(0.25, 0.15, 0.1)))     # hair
	p.add_child(_box(Vector3(0.4, 0.45, 0), Vector3(0.2, 0.1, 0.12), Color(0.85, 0.65, 0.45))) # arm
	p.add_child(_box(Vector3(0.55, 0.45, 0), Vector3(0.08, 0.7, 0.08), Color(0.7, 0.72, 0.78))) # sword
	player_node.position = _tile_to_world(player_tile)
	player_hp_label = _make_hp_label(player_node, Vector3(0, 1.5, 0))


func _build_enemies() -> void:
	var rat_tile := Vector2i(9, 5)
	var rat := Node3D.new()
	add_child(rat)
	rat.add_child(_box(Vector3(0, 0.35, 0), Vector3(1.5, 0.8, 0.9), Color(0.34, 0.30, 0.28)))      # body
	rat.add_child(_box(Vector3(0.9, 0.45, 0), Vector3(0.6, 0.55, 0.55), Color(0.30, 0.26, 0.24)))  # head
	rat.add_child(_box(Vector3(1.25, 0.35, 0), Vector3(0.2, 0.2, 0.2), Color(0.85, 0.55, 0.6)))    # snout
	rat.add_child(_box(Vector3(0.8, 0.9, 0.28), Vector3(0.22, 0.22, 0.04), Color(0.3, 0.26, 0.24)))   # ear
	rat.add_child(_box(Vector3(0.8, 0.9, -0.28), Vector3(0.22, 0.22, 0.04), Color(0.3, 0.26, 0.24)))  # ear
	rat.add_child(_box(Vector3(1.2, 0.5, 0.16), Vector3(0.05, 0.05, 0.05), Color(1.0, 0.2, 0.1), true))   # eye
	rat.add_child(_box(Vector3(1.2, 0.5, -0.16), Vector3(0.05, 0.05, 0.05), Color(1.0, 0.2, 0.1), true))  # eye
	rat.add_child(_box(Vector3(-1.0, 0.3, 0), Vector3(1.0, 0.1, 0.1), Color(0.75, 0.5, 0.6)))      # tail
	for lx in [-0.4, 0.4]:
		for lz in [-0.4, 0.4]:
			rat.add_child(_box(Vector3(lx, 0.1, lz), Vector3(0.3, 0.2, 0.3), Color(0.3, 0.26, 0.24)))  # legs
	rat.position = _tile_to_world(rat_tile)
	enemies.append({
		"node": rat, "tile": rat_tile, "hp": 45, "max_hp": 45, "kind": "rat", "alive": true,
		"label": _make_hp_label(rat, Vector3(0, 1.6, 0)),
	})

	for i in 3:
		var pup_tile := Vector2i(9 + (i - 1), 6)
		var pup := Node3D.new()
		add_child(pup)
		pup.add_child(_box(Vector3(0, 0.15, 0), Vector3(0.5, 0.3, 0.3), Color(0.5, 0.45, 0.42)))
		pup.add_child(_box(Vector3(0.3, 0.3, 0), Vector3(0.2, 0.2, 0.2), Color(0.46, 0.4, 0.38)))
		pup.add_child(_box(Vector3(0.3, 0.4, 0.1), Vector3(0.03, 0.03, 0.03), Color(1.0, 0.2, 0.1), true))
		pup.add_child(_box(Vector3(0.3, 0.4, -0.1), Vector3(0.03, 0.03, 0.03), Color(1.0, 0.2, 0.1), true))
		pup.position = _tile_to_world(pup_tile)
		enemies.append({ "node": pup, "tile": pup_tile, "hp": 4, "max_hp": 4, "kind": "pup", "alive": true, "label": null })


func _make_hp_label(parent: Node3D, offset: Vector3) -> Label3D:
	var lbl := Label3D.new()
	lbl.position = offset
	lbl.font_size = 24
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.modulate = Color(0.7, 1.0, 0.7)
	parent.add_child(lbl)
	return lbl


# ─────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────
func _tile_to_world(t: Vector2i) -> Vector3:
	return Vector3(t.x * TILE, 0.0, t.y * TILE)


func _box(pos: Vector3, size: Vector3, color: Color, emissive := false) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.9
	if emissive:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = 2.0
	bm.material = mat
	mi.mesh = bm
	mi.position = pos
	return mi


func _setup_hud() -> void:
	var canvas := CanvasLayer.new()
	add_child(canvas)
	hud = Label.new()
	hud.position = Vector2(20, 20)
	hud.add_theme_font_size_override("font_size", 20)
	canvas.add_child(hud)


func _rat_hp() -> int:
	for e in enemies:
		if e.kind == "rat" and e.alive:
			return e.hp
	return 0


func _refresh_hp_labels() -> void:
	player_hp_label.text = "HP %d/%d" % [player_hp, player_max]
	player_hp_label.modulate = Color(0.7, 1.0, 0.7) if player_hp > 8 else Color(1.0, 0.5, 0.4)
	for e in enemies:
		if e.kind == "rat" and e.label != null:
			e.label.text = "HP %d/%d" % [e.hp, e.max_hp]


func _update_hud() -> void:
	var turn := "▶ YOUR TURN — move (WASD/arrows) · attack (Space) · end turn (Enter)"
	if phase == "enemy":
		turn = "🐀 ENEMY TURN"
	elif phase == "won":
		turn = "🏆 THE MOTHER RAT IS DEAD — you win!"
	elif phase == "lost":
		turn = "💀 You were overrun. Press R to restart."
	var babies_left := 0
	for e in enemies:
		if e.alive and e.kind == "pup":
			babies_left += 1
	hud.text = ("DUNGEON HANGOVER — Godot demo\n\n"
		+ "Greg: %d/%d HP   ·   moves left %d\n" % [player_hp, player_max, player_moves]
		+ "Mother Rat: %d HP   ·   pups: %d\n\n" % [_rat_hp(), babies_left]
		+ turn + "\n\n"
		+ log_line)


# ─────────────────────────────────────────────────────────────
# input
# ─────────────────────────────────────────────────────────────
func _unhandled_input(event: InputEvent) -> void:
	if phase == "won":
		return
	if phase == "lost":
		if event is InputEventKey and event.pressed and event.keycode == KEY_R:
			get_tree().reload_current_scene()
		return
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			cam_distance = clamp(cam_distance - 0.8, 8.0, 28.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			cam_distance = clamp(cam_distance + 0.8, 8.0, 28.0)
		return
	if phase != "player":
		return
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_W, KEY_UP:
				_try_move(Vector2i(0, -1))
			KEY_S, KEY_DOWN:
				_try_move(Vector2i(0, 1))
			KEY_A, KEY_LEFT:
				_try_move(Vector2i(-1, 0))
			KEY_D, KEY_RIGHT:
				_try_move(Vector2i(1, 0))
			KEY_SPACE:
				if not attacked_this_turn:
					_player_attack()
				else:
					log_line = "You already attacked this turn."
			KEY_ENTER, KEY_KP_ENTER:
				_end_turn()
			KEY_Q:
				cam_yaw += 0.15
			KEY_E:
				cam_yaw -= 0.15
		_update_hud()


# ─────────────────────────────────────────────────────────────
# player turn
# ─────────────────────────────────────────────────────────────
func _try_move(delta_tile: Vector2i) -> void:
	if player_moves <= 0:
		log_line = "No movement left this turn."
		return
	var target := player_tile + delta_tile
	if target.x < ROOM_MIN or target.x > ROOM_MAX or target.y < ROOM_MIN or target.y > ROOM_MAX:
		log_line = "A wall blocks the way."
		return
	for e in enemies:
		if e.alive and e.tile == target:
			log_line = "Something is standing there."
			return
	player_tile = target
	player_moves -= 1
	player_node.position = _tile_to_world(player_tile)
	log_line = ""


func _player_attack() -> void:
	var target = _adjacent_enemy(player_tile)
	if target == null:
		log_line = "No enemy in reach — move closer."
		return
	attacked_this_turn = true
	var dmg := randi_range(1, 6) + 2
	target.hp -= dmg
	_lunge(player_node, target.node.position)
	_spawn_damage(target.node, dmg)
	log_line = "Greg hits %s for %d!" % [_enemy_name(target), dmg]
	_refresh_hp_labels()
	if target.hp <= 0:
		_kill_enemy(target)


func _end_turn() -> void:
	phase = "enemy"
	enemy_idx = 0
	enemy_timer = 0.5
	attacked_this_turn = false
	_update_hud()


# ─────────────────────────────────────────────────────────────
# enemy turn (stepped in _process)
# ─────────────────────────────────────────────────────────────
func _process(delta: float) -> void:
	var center := Vector3(6.5, 1.0, 6.5)
	var cp := cos(cam_pitch)
	var eye := center + Vector3(sin(cam_yaw) * cp, sin(cam_pitch), cos(cam_yaw) * cp) * cam_distance
	cam.position = eye
	cam.look_at(center)

	if phase != "enemy":
		return
	enemy_timer -= delta
	if enemy_timer > 0:
		return
	enemy_timer = 0.5
	if not _enemy_step():
		phase = "player"
		player_moves = 4
		attacked_this_turn = false
		_update_hud()


func _enemy_step() -> bool:
	while enemy_idx < enemies.size():
		var e = enemies[enemy_idx]
		enemy_idx += 1
		if not e.alive:
			continue
		if e.kind == "rat":
			_rat_act(e)
		else:
			_pup_act(e)
		_update_hud()
		return true
	return false


func _rat_act(e) -> void:
	if _adjacent(e.tile, player_tile):
		var dmg := randi_range(1, 6) + 1
		player_hp -= dmg
		_lunge(e.node, player_node.position)
		_spawn_damage(player_node, dmg)
		log_line = "The Mother Rat bites Greg for %d!" % dmg
		_refresh_hp_labels()
		if player_hp <= 0:
			player_hp = 0
			phase = "lost"
	else:
		var step := _greedy_step(e, player_tile)
		if step != Vector2i.ZERO:
			e.tile += step
			e.node.position = _tile_to_world(e.tile)


func _pup_act(e) -> void:
	if _adjacent(e.tile, player_tile):
		player_hp -= 1
		_lunge(e.node, player_node.position)
		_spawn_damage(player_node, 1)
		log_line = "A pup nips Greg for 1!"
		_refresh_hp_labels()
		if player_hp <= 0:
			player_hp = 0
			phase = "lost"
	else:
		var step := _greedy_step(e, player_tile)
		if step != Vector2i.ZERO:
			e.tile += step
			e.node.position = _tile_to_world(e.tile)


func _greedy_step(e, target: Vector2i) -> Vector2i:
	var best := Vector2i.ZERO
	var best_d := _manhattan(e.tile, target)
	for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		var t: Vector2i = e.tile + d
		if t.x < ROOM_MIN or t.x > ROOM_MAX or t.y < ROOM_MIN or t.y > ROOM_MAX:
			continue
		if t == player_tile:
			continue
		var occupied := false
		for o in enemies:
			if o.alive and o != e and o.tile == t:
				occupied = true
				break
		if occupied:
			continue
		var dd := _manhattan(t, target)
		if dd < best_d:
			best_d = dd
			best = d
	return best


func _adjacent(a: Vector2i, b: Vector2i) -> bool:
	return maxi(absi(a.x - b.x), absi(a.y - b.y)) <= 1


func _adjacent_enemy(tile: Vector2i):
	for e in enemies:
		if e.alive and _adjacent(e.tile, tile):
			return e
	return null


func _manhattan(a: Vector2i, b: Vector2i) -> int:
	return absi(a.x - b.x) + absi(a.y - b.y)


func _enemy_name(e) -> String:
	return "the Mother Rat" if e.kind == "rat" else "a pup"


func _kill_enemy(e) -> void:
	e.alive = false
	e.node.visible = false
	if e.kind == "rat":
		log_line = "The Mother Rat collapses — victory!"
		phase = "won"
	else:
		log_line = "A pup is squashed."
	_update_hud()


# ─────────────────────────────────────────────────────────────
# juice: lunge + floating damage
# ─────────────────────────────────────────────────────────────
func _lunge(node: Node3D, target: Vector3) -> void:
	var home := node.position
	var dir := (target - home)
	dir.y = 0
	dir = dir.normalized()
	var tw := create_tween()
	tw.tween_property(node, "position", home + dir * 0.5, 0.08)
	tw.tween_property(node, "position", home, 0.12)


func _spawn_damage(node: Node3D, dmg: int) -> void:
	var lbl := Label3D.new()
	lbl.text = str(dmg)
	lbl.font_size = 48
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.modulate = Color(1.0, 0.35, 0.3)
	lbl.position = node.position + Vector3(0, 1.8, 0)
	add_child(lbl)
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(lbl, "position:y", lbl.position.y + 1.0, 0.7)
	tw.tween_property(lbl, "modulate:a", 0.0, 0.7)
	tw.chain().tween_callback(lbl.queue_free)
