# Passable Pet Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/default)
[![version](https://img.shields.io/badge/version-v1.0.0-blue.svg)](https://github.com/GBear09/passable-pet-card/releases)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A sleek, modern, and comprehensive Home Assistant Lovelace card designed specifically for the **Fi Smart Dog Collar (TryFi)** integration. Built with glassmorphism aesthetics, animated expanding pill navigation, **Native Home Assistant `ha-entity-picker` Visual UI Editor support**, and **zero-config smart entity auto-discovery**.

Part of the **"Passable"** suite of Home Assistant dashboard cards.

---

## ✨ Features

- 🛠️ **Native `ha-entity-picker` Visual UI Editor**: Fully customizable through Home Assistant's dashboard editor UI with dropdown pickers, icons, domain filtering, and real-time previews.
- 🔍 **Zero-Config Smart Auto-Discovery**: Drop `type: custom:passable-pet-card` onto your dashboard, and it will automatically find your TryFi dog (e.g. Hudson), collar battery, light, steps, distance, sleep, naps, and bases without writing a single line of YAML!
- 🐶 **Interactive Expanding Pill Navigation**:
  - **Overview**: Pet avatar photo hero with live aura halo, circular SVG collar battery ring gauge with charging beam, current location pill, quick collar LED light toggle, expandable color swatch palette, emergency Lost Mode trigger, and 2x2 telemetry quick stats.
  - **Activity**: Step goal circular progress ring with percentage completion, daily target vs actuals, distance walked, and side-by-side Today / 7-Day / 30-Day activity comparisons.
  - **Wellness**: Rest architecture breakdown (Deep Sleep vs Naps), proportional stacked bar, 24-hour rest percentage, and daily/weekly/monthly sleep history.
  - **Location & Bases**: Current place name and address, zone badge, GPS coordinates with accuracy, "Open in Google Maps" external launch button, connection status chip (Cellular, Base, Bluetooth), and TryFi Base Station connectivity status (e.g., Kitchen Base, Basement Base).
- 💡 **Actionable Collar Controls**:
  - **Collar Light**: Toggle collar LED on/off and open the 9-color swatch drawer (White, Fi Yellow, Fi Blue, Red, Green, Purple, Orange, Cyan, Pink) to change collar color in real-time.
  - **Lost Dog Mode**: High-visibility emergency trigger with double-check confirmation dialog to prevent accidental activation. When active, pulses a bright red alert banner across the card and activates live collar GPS beacons.
- 🔋 **Dynamic Battery Ring Gauge**: Circular SVG gauge color-coded by battery level (>40% green, 20-40% amber, <20% red) with animated charging lightning bolt indicator when docked.
- 📱 **Touch Gesture Support**: Swipe left or right on mobile devices or tablets to seamlessly switch views.
- 🌓 **Theme Responsive**: Adapts automatically to Home Assistant light and dark themes using standard CSS theme variables.

---

## 📦 Installation

### Option 1: HACS (Recommended)

1. Open **HACS** in your Home Assistant instance.
2. Click the three dots `⋮` in the top-right corner and select **Custom repositories**.
3. Add repository:
   - **Repository**: `https://github.com/GBear09/passable-pet-card`
   - **Type**: `Lovelace` (Dashboard)
4. Click **Add**, then search for **Passable Pet Card** and click **Download**.
5. Refresh your browser page.

### Option 2: Manual Installation

1. Download `passable-pet-card.js` from the [Latest Release](https://github.com/GBear09/passable-pet-card/releases).
2. Copy `passable-pet-card.js` to your Home Assistant `config/www/` directory.
3. In Home Assistant, go to **Settings** -> **Dashboards** -> **Three Dots (Top Right)** -> **Resources**.
4. Click **Add Resource**:
   - **URL**: `/local/passable-pet-card.js?v=1.0.0`
   - **Resource Type**: `JavaScript Module`
5. Refresh your dashboard.

---

## 🛠️ Configuration

### Minimal (Auto-Discovery)
```yaml
type: custom:passable-pet-card
```

### Standard Configuration
```yaml
type: custom:passable-pet-card
title: "Hudson"
subtitle: "Golden Retriever"
entity: device_tracker.hudson_tracker
step_goal: 15000
distance_unit: "mi"
```

### Full Configuration Reference
```yaml
type: custom:passable-pet-card
title: "Hudson"
subtitle: "Golden Retriever"
entity: device_tracker.hudson_tracker
prefix: "hudson"
step_goal: 15000
distance_unit: "mi" # 'auto', 'km', or 'mi'
image: "https://media.tryfi.com/pet/avatar/..." # Optional custom image override
icon: "mdi:paw"

# Advanced Manual Entity Overrides (Optional - auto-discovered by default):
battery: sensor.hudson_collar_battery_level
charging: binary_sensor.hudson_collar_battery_charging
light: light.hudson_collar_light
lost_mode: select.hudson_lost_mode
activity_type: sensor.hudson_activity_type
place_name: sensor.hudson_current_place_name
place_address: sensor.hudson_current_place_address
connected_to: sensor.hudson_connected_to
daily_steps: sensor.hudson_daily_steps
weekly_steps: sensor.hudson_weekly_steps
monthly_steps: sensor.hudson_monthly_steps
daily_distance: sensor.hudson_daily_distance
weekly_distance: sensor.hudson_weekly_distance
monthly_distance: sensor.hudson_monthly_distance
daily_sleep: sensor.hudson_daily_sleep
weekly_sleep: sensor.hudson_weekly_sleep
monthly_sleep: sensor.hudson_monthly_sleep
daily_nap: sensor.hudson_daily_nap
weekly_nap: sensor.hudson_weekly_nap
monthly_nap: sensor.hudson_monthly_nap
bases:
  - sensor.kitchen
  - sensor.basement
```

---

## ⚙️ Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | `string` | **Required** | `custom:passable-pet-card` |
| `entity` | `string` | optional | Primary `device_tracker` entity (e.g. `device_tracker.hudson_tracker`). Triggers auto-discovery. |
| `prefix` | `string` | optional | Entity prefix (e.g. `hudson`). Discovers all related TryFi sensors. |
| `title` | `string` | auto | Pet name displayed in card header. |
| `subtitle` | `string` | auto | Pet breed or collar description. |
| `step_goal` | `number` | `15000` | Target daily step goal for progress ring. |
| `distance_unit` | `string` | `auto` | `auto`, `km`, or `mi`. |
| `image` | `string` | auto | Custom photo URL. Defaults to TryFi avatar URL. |
| `icon` | `string` | `mdi:paw` | Header title icon. |

---

## 📄 License

Distributed under the [MIT License](LICENSE).
