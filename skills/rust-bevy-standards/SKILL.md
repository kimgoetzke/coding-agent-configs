---
name: rust-bevy-standards
description: Write idiomatic Rust code for applications that use Bevy Engine. Augments rust-standards skill, does not replace it. Use when writing Rust code for a Bevy application.
---

⚠️ Bevy 0.17+ Breaking Changes

- Material handles wrapped in `MeshMaterial3d<T>`, not `Handle<T>`
- Observer pattern replaces event system (`commands.trigger()`, `add_observer()`)
- `Event` split into `Message` (buffered) and `Event` (observers)
- `EventWriter`/`EventReader` replaced by `MessageWriter`/`MessageReader` (`message.write()` / `messages.read()`)
- Observer trigger API changed:

  ```rust
  // Old
  commands.add_observer(|trigger: Trigger<OnAdd, Player>| {
      info!("Spawned player {}", trigger.target());
  });

  // New
  commands.add_observer(|add: On<Add, Player>| {
      info!("Spawned player {}", add.entity);
  });
  ```

- Color arithmetic removed; use component extraction instead

⚠️ Bevy 0.18+ Breaking Changes

- `RenderTarget` is now a required component on `Camera`, not a `Camera` field:
  ```rust
  // Old
  Camera { target: RenderTarget::Image(handle.into()), ..default() }
  // New
  commands.spawn((Camera3d::default(), RenderTarget::Image(handle.into())));
  ```
- `BorderRadius` is now a field on `Node`, not a component
- `LineHeight` is now a required component on `Text`/`Text2d`/`TextSpan`; removed from `TextFont`
- `AmbientLight` resource renamed to `GlobalAmbientLight`; `AmbientLight` is now a component on `Camera`
- `clear_children` → `detach_all_children`, `remove_children` → `detach_children`, `remove_child` → `detach_child` (same on `EntityCommands` and `EntityWorldMut`)
- `AnimationTarget { id, player }` replaced by separate `AnimationTargetId(id)` and `AnimatedBy(player_entity)` components
- `next_state.set(...)` now always fires `OnEnter`/`OnExit`; use `set_if_neq` for the old behaviour
- `MaterialPlugin` fields `prepass_enabled`/`shadows_enabled` replaced by `Material` trait methods `enable_prepass()`/`enable_shadows()`
- `SimpleExecutor` removed; use `SingleThreadedExecutor` instead
- `#[reflect(...)]` now only supports parentheses, not braces or brackets
- `AssetLoader`, `AssetSaver`, `AssetTransformer`, `Process` now require `#[derive(TypePath)]`
- `ron` no longer re-exported from `bevy_scene` or `bevy_asset`; add it as a direct dependency
- Feature renames: `animation` → `gltf_animation`, `bevy_sprite_picking_backend` → `sprite_picking`, `bevy_ui_picking_backend` → `ui_picking`, `bevy_mesh_picking_backend` → `mesh_picking`

## General

- Never delete target binaries — Bevy rebuilds take minutes

## Footguns

- `despawn()` orphans children, consider `despawn_recursive()` instead
- Commands are deferred — world mutations apply at end of schedule; don't read back in the same system what you wrote via commands
- Use `Changed<T>` and `Added<T>` query filters to skip unchanged components — omitting these is the most common Bevy performance mistake
- Use observers (`OnAdd`, `OnRemove`) for component lifecycle reactions; don't poll for these in `Update`

## Naming

- No unnecessary abbreviations: `position` not `pos`
- ECS systems: name ends in `_system`
- Message handlers: name starts with `handle_`, ends in `_message`

## ECS

- Think in data (components) and transformations (systems), not objects and methods
- Components = pure data, no logic
- Systems = pure logic, operate on components
- Events/Messages = communication between systems
- Resources = global state; use sparingly
- Keep components small and focused; one large component defeats ECS cache locality

## System Design

### Plugin structure

- Break the app into discrete modules using plugins
- All plugin structs must have a `///` doc comment explaining their purpose and scope

```rust
/// Handles damage processing and death detection.
pub struct CombatPlugin;

impl Plugin for CombatPlugin {
    fn build(&self, app: &mut App) {
        app
            .add_event::<DamageEvent>()
            .add_systems(Update, (process_damage, check_death));
    }
}
```

### System sets

- Use run conditions (`run_if(in_state(...))`) to skip whole systems
- Use `OnEnter`/`OnExit` schedules for state transitions, not flags checked in `Update`

### System ordering

```rust
.add_systems(
    Update,
    (
        // 1. Input
        handle_input,

        // 2. State changes
        process_events,
        update_state,

        // 3. Derived values
        calculate_derived_values,

        // 4. Visuals
        update_materials,
        update_animations,

        // 5. UI (last)
        update_ui_displays,
    ),
)
```
