---
name: rust-bevy-standards
description: Write idiomatic Rust code for applications that use Bevy Engine. Augments rust-standards skill, does not replace it. Use when writing Rust code for a Bevy application.
---

## Bevy 0.17 breaking changes

- Material handles wrapped in `MeshMaterial3d<T>`, not `Handle<T>`
- Use `Message` for buffered delivery (`MessageWriter::write`, `MessageReader::read`) and `Event` for observers (`commands.trigger()`, `add_observer()`)

- Color arithmetic removed; use component extraction instead

## Bevy 0.18 breaking changes

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
- `next_state.set(...)` now runs `OnExit`/`OnEnter` even if the state is unchanged
- `MaterialPlugin` fields `prepass_enabled`/`shadows_enabled` replaced by `Material` trait methods `enable_prepass()`/`enable_shadows()`
- `SimpleExecutor` removed; use `SingleThreadedExecutor` instead
- `#[reflect(...)]` now only supports parentheses, not braces or brackets
- `AssetLoader`, `AssetSaver`, `AssetTransformer`, `Process` now require `#[derive(TypePath)]`
- `ron` no longer re-exported from `bevy_scene` or `bevy_asset`; add it as a direct dependency
- Feature renames: `animation` → `gltf_animation`, `bevy_sprite_picking_backend` → `sprite_picking`, `bevy_ui_picking_backend` → `ui_picking`, `bevy_mesh_picking_backend` → `mesh_picking`

## Bevy 0.20 breaking changes

Read the [0.19 → 0.20 migration guide](https://bevy.org/learn/migration-guides/0-19-to-0-20/) if you need additional information.

- `On<E, B>` moves the bundle into the event pattern: `On<Add<Player>>`, `On<Remove<Player>>`, etc. Use `On<Add<()>>` with `Observer::with_component` for dynamic component IDs, or implement `EventPattern` for custom events filtered by a bundle.

  ```rust
  commands.add_observer(|add: On<Add<Player>>| {
      info!("Added Player to {}", add.entity);
  });
  ```

- Several built-in render and UI sets now use weak ordering (`.chain_weak()`, `.before_weak()`, `.after_weak()`). Non-conflicting systems may run out of order. For dependencies the scheduler cannot see (e.g. channels or interior mutability), declare a strict `.after()` or `.before()` dependency.
- `iter_many`, `iter_many_unique` and their mutable, sorted and parallel variants now yield `Result<_, QueryEntityError>`. Use `.matched()` on `QueryManyIter` or `QueryManyUniqueIter` only if missing or non-matching entities should be skipped.
- `&mut World` is now a `SystemParam` and need not come first. It still cannot be combined with parameters that conflict with exclusive world access. `ExclusiveSystemParam` is gone.
- BSN scene references use `@` (`@scene`, `@scene_fn()`, `@{expr}`); component values no longer need `template_value(...)`. Separate entities with `--`, use braces for `bsn!` and `bsn_list!`, and supply all fields of enum variants.
- WESL replaces `naga_oil`. Plain WGSL still works; the `shader_format_wesl` feature and GLSL support are gone.
- `Camera3d` no longer adds `ScreenSpaceTransmission`. Add it explicitly when a camera needs screen-space specular transmission.
- Picking events are flat: `On<PointerPress>` replaces `On<Pointer<Press>>`. Read `event.pointer.id` and `event.pointer.position`; use `PointerEvent` as the generic bound. For UI buttons, prefer `ui_widgets::Button`, `picking::hover::Hovered` and `ui::Pressed` over the deprecated UI `Button` and `Interaction`.
- A text input widget needs both `EditableText` and `TextInput`. Escape clears focus and bubbles; use `original_event_target()` if an ancestor should ignore the press that blurred the field.
- `BorderRadius` still lives on `Node`, but each corner now takes a `CornerRadius`, not a `Val`. Use `CornerRadius::circular(px(8.))` or `px(8.).into()` for circular corners.

## General

- Never delete target binaries — Bevy rebuilds take minutes

## Footguns

- `despawn()` also despawns descendants linked by `ChildOf`. Call `detach_all_children()` first to preserve them.
- `Commands` mutations are not visible in the issuing system. A dependent system ordered with `.after()` or `.chain()` sees them once `ApplyDeferred` runs; the schedule normally inserts that sync point.
- Use `Changed<T>` and `Added<T>` query filters to skip unchanged components — omitting these is the most common Bevy performance mistake
- Use lifecycle observers for immediate add/remove reactions rather than polling in `Update`. Use the version-specific `On` signatures above.

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
#[derive(Debug)]
pub struct CombatPlugin;

impl Plugin for CombatPlugin {
    fn build(&self, app: &mut App) {
        app.add_message::<DamageMessage>()
            .add_systems(
                Update,
                (handle_damage_message, check_death_system).chain(),
            );
    }
}
```

### System sets

- Use run conditions (`run_if(in_state(...))`) to skip whole systems
- Use `OnEnter`/`OnExit` schedules for state transitions, not flags checked in `Update`

### System ordering

Tuple order alone does not order systems. Use `.chain()` when each system must finish before the next starts.

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
    )
        .chain(),
)
```
