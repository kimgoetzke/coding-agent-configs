---
name: rust-bevy-test-conventions
description: Conventions and best practice for writing tests in Rust applications using Bevy ECS. Use when writing or creating tests for Bevy systems, components, resources, or game logic in Rust.
---

# Rust Bevy test conventions

## Quick start

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use bevy::prelude::*;
    use bevy::MinimalPlugins;

    fn setup() -> App {
        let mut app = App::new();
        app.add_plugins((MinimalPlugins, YourPlugin));
        app
    }

    #[test]
    fn system_produces_expected_output() {
        let mut app = setup();

        // Setup: Add resources and entities
        app.insert_resource(YourResource::default());

        // Action: Run the system
        app.update();

        // Assert: Verify results
        let resource = app.world().resource::<YourResource>();
        assert_eq!(resource.value, expected_value);
    }
}
```

## Testing ECS systems

### Integration-style approach

Test Bevy systems using full `App` instances with `MinimalPlugins`:

```rust
fn setup() -> App {
    let mut app = App::new();
    app.add_plugins((
        MinimalPlugins,
        YourPlugin,
        // Add other required plugins
    ));
    app
}

#[test]
fn player_input_system_sends_move_message() {
    let mut app = setup();

    // Setup state
    app.insert_resource(NextState::Pending(AppState::Playing));
    app.update(); // Apply state transition

    // Trigger system behavior
    app.world_mut().send_event(KeyboardInput {
        key_code: KeyCode::KeyW,
        state: ButtonState::Pressed,
        /* ... */
    });
    app.update();

    // Verify via message resource
    let messages = app.world().resource::<Messages<MoveMessage>>();
    assert!(!messages.is_empty());
}
```

### Setup helper functions

Create a common `setup()` function to reduce boilerplate:

```rust
fn setup() -> App {
    let mut app = App::new();
    app.add_plugins((MinimalPlugins, ControlsPlugin, StatesPlugin));
    app.init_resource::<Messages<YourMessage>>();
    app
}

fn setup_with_player() -> App {
    let mut app = setup();
    app.world_mut().spawn(Player::default());
    app
}
```

### State simulation

Use `NextState` to manually advance system states:

```rust
fn change_app_state(app: &mut App, state: AppState) {
    app.insert_resource(NextState::Pending(state));
    app.update(); // Process state transition
}

#[test]
fn system_only_runs_in_playing_state() {
    let mut app = setup();
    change_app_state(&mut app, AppState::Playing);

    // Now test system behavior
    app.update();
    // ...
}
```

### Message-based verification

Read from `Messages<T>` resource after system execution:

```rust
#[test]
fn action_system_sends_action_message() {
    let mut app = setup();

    // Trigger action
    send_action_input(&mut app);
    app.update();

    // Verify message was sent
    let messages = app.world().resource::<Messages<ActionMessage>>();
    assert_eq!(messages.len(), 1);

    let message = &messages[0];
    assert_eq!(message.action_type, ActionType::Jump);
}
```

## Testing components & resources

### Unit test pattern

Test components and resources directly without full app context:

```rust
#[test]
fn snake_segment_default_is_empty() {
    let segment = SnakeSegment::default();
    assert!(segment.positions().is_empty());
    assert!(segment.mesh_entity().is_none());
}

#[test]
fn player_health_decreases_on_damage() {
    let mut health = Health::new(100);
    health.take_damage(25);
    assert_eq!(health.current(), 75);
}
```

### Behavior testing

Exercise component methods and verify state changes:

```rust
#[test]
fn inventory_add_item_increases_count() {
    let mut inventory = Inventory::default();
    inventory.add_item(Item::Sword);

    assert_eq!(inventory.item_count(), 1);
    assert!(inventory.contains(&Item::Sword));
}
```

## Test utilities & helpers

### Test-only constructor methods

Add test constructors in `#[cfg(test)]` blocks:

```rust
impl PlayerInput {
    #[cfg(test)]
    pub(crate) fn test(id: u8, direction: Direction) -> Self {
        Self {
            player_id: PlayerId(id),
            direction,
            timestamp: 0,
        }
    }
}

impl RegisteredPlayer {
    #[cfg(test)]
    pub fn new_immutable(id: PlayerId, name: String) -> Self {
        Self {
            id,
            name,
            is_mutable: false,
            connection: None,
        }
    }
}
```

### Test helper functions

Create helper functions to abstract complex setup:

```rust
fn handle_key_input(app: &mut App, desired_input: TestKeyboardInput) {
    let mut keyboard_input = app.world_mut().resource_mut::<ButtonInput<KeyCode>>();
    match desired_input {
        TestKeyboardInput::Press(key_code) => keyboard_input.press(key_code),
        TestKeyboardInput::Release(key_code) => keyboard_input.release(key_code),
    };
    app.update();
}

enum TestKeyboardInput {
    Press(KeyCode),
    Release(KeyCode),
}
```

## Common patterns & conventions

### Assertion-first testing

Prefer simple Rust assertions:

```rust
assert!(condition, "Helpful, succinct failure message");
assert_eq!(actual, expected);
assert_ne!(actual, unexpected);
```

### Feature-gated tests

Use conditional compilation for feature-specific tests:

```rust
#[cfg(feature = "online")]
#[test]
fn multiplayer_connection_establishes() {
    // Test only runs when 'online' feature is enabled
}
```

### Explicit failure messages

Provide clear panic messages for unexpected states:

```rust
let Some(entity) = entities.first() else {
    panic!("Expected at least one entity but found none");
};

match result {
    Ok(value) => assert_eq!(value, expected),
    Err(e) => panic!("Expected Ok but got Err: {:?}", e),
}
```

### Resource lifecycle

Drop mutated resources before reading to ensure cleanup:

```rust
{
    let mut resource = app.world_mut().resource_mut::<YourResource>();
    resource.modify();
} // Drop mutable borrow

let resource = app.world().resource::<YourResource>();
assert_eq!(resource.state, ExpectedState);
```

### Working with messages

- Since Bevy 0.17, you will normally use `Message`s where you previously used `Event`s
- `app.world().send_event()` does not exist - use `.write_message()` instead

```rust
// Write a message
app
    .world_mut()
    .write_message(YourMessage::Something(PlayerId(0)))
    .expect("Failed to write YourMessage message");


// Read produced messages
let messages = app
    .world_mut()
    .get_resource_mut::<Messages<YourMessage>>()
    .expect("YourMessage has not been sent");

// Match on specifics
let has_something = messages
    .iter_current_update_messages()
    .any(|ym| matches!(ym, YourMessage::Something(_)));
assert!(has_something, "Expected 'Something' to have been sent");

// Match message was sent
let mut messages: Mut<Messages<YourMessage>> = app
    .world_mut()
    .get_resource_mut::<Messages<YourMessage>>()
    .expect("YourMessage has not been sent");
assert!(messages.drain().next().is_some(), "YourMessage was never sent");
```

### Changing app state

```rust
let mut app = setup();

let state = app.world().resource::<State<AppState>>();
assert_eq!(state.get(), &AppState::Loading);

let mut next_state = app.world_mut().resource_mut::<NextState<AppState>>();
next_state.set(AppState::Registering);
app.update();

let state = app.world().resource::<State<AppState>>();
assert_eq!(state.get(), &AppState::Registering);
```

## Naming conventions

Follow the pattern: `<name of function/system>_<given>_<when>_<then>`

- Only use `_<given>` when `<name of function/system>` and `<when>` are the same
- `<given>`, `<when>` and `<then>` are silent - don't write out these words
- Use snake case

Good examples:

- `snake_segment_default_is_empty` when testing `SnakeSegment::default()`
- `player_input_system_sends_move_and_action_messages` when testing `fn player_input_system`
- `register_adds_player_when_not_already_registered` when testing `{registered_players}.register({...})`
- `unregister_mutable_returns_error_when_player_is_remote` when testing `{registered_players}.unregister_mutable({...})`

## Best practices

1. **Minimal mocking**: Prefer real components with `MinimalPlugins` over mocks
2. **DRY setup**: Extract common setup into helper functions
3. **Test one behavior**: Each test should verify a single behavior
4. **Descriptive names**: Test names should read as specifications
5. **Inline documentation**: Add comments explaining setup, action, and verification phases
6. **Fast tests**: Use `MinimalPlugins` instead of `DefaultPlugins` for speed
7. **Isolation**: Tests should not depend on execution order
8. **Clear assertions**: Verify specific values, not just "truthy" conditions

## Advanced patterns

### Testing systems with queries

```rust
#[test]
fn damage_system_applies_to_all_enemies() {
    let mut app = setup();

    // Spawn multiple entities
    app.world_mut().spawn((Enemy, Health::new(100)));
    app.world_mut().spawn((Enemy, Health::new(100)));
    app.world_mut().spawn((Enemy, Health::new(100)));

    app.insert_resource(GlobalDamage(10));
    app.update();

    // Query all enemies
    let mut query = app.world_mut().query::<&Health>();
    for health in query.iter(app.world()) {
        assert_eq!(health.current(), 90);
    }
}
```
