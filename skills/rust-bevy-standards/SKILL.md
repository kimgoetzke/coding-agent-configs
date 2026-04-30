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

## General

- Never delete target binaries — Bevy rebuilds take minutes

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
