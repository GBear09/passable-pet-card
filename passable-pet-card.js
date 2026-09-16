/**
 * Passable Pet Card
 * Version: 1.0.1
 * GitHub: https://github.com/GBear09/passable-pet-card
 * Description: A sleek, comprehensive Home Assistant dashboard card for Fi smart dog collars (TryFi)
 * with real-time activity tracking, collar LED controls, lost mode emergency trigger, and native visual UI editor.
 */

const CARD_VERSION = "1.0.1";

console.info(
  `%c PASSABLE PET CARD %c v${CARD_VERSION} `,
  "color: white; background: #ff9800; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;",
  "color: #ff9800; background: #fff3e0; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0;"
);

// Register card in Home Assistant custom card registry
window.customCards = window.customCards || [];
window.customCards.push({
  type: "passable-pet-card",
  name: "Passable Pet Card",
  description: "A sleek, comprehensive dashboard card for Fi smart dog collars (TryFi) with activity tracking, collar LED controls, lost mode emergency trigger, and visual UI editor.",
  preview: true,
});

const LitElement =
  window.LitElement ||
  Object.getPrototypeOf(customElements.get("hui-entities-card"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

// Predefined LED Colors for the Fi Collar
const COLLAR_COLORS = [
  { name: "White", rgb: [255, 255, 255], hex: "#FFFFFF" },
  { name: "Fi Yellow", rgb: [255, 214, 0], hex: "#FFD600" },
  { name: "Fi Blue", rgb: [33, 150, 243], hex: "#2196F3" },
  { name: "Red", rgb: [244, 67, 54], hex: "#F44336" },
  { name: "Green", rgb: [76, 175, 80], hex: "#4CAF50" },
  { name: "Purple", rgb: [156, 39, 176], hex: "#9C27B0" },
  { name: "Orange", rgb: [255, 152, 0], hex: "#FF9800" },
  { name: "Cyan", rgb: [0, 188, 212], hex: "#00BCD4" },
  { name: "Pink", rgb: [233, 30, 99], hex: "#E91E63" }
];

// Helper: Format Number with commas
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "--";
  return Math.round(Number(num)).toLocaleString();
}

// Helper: Format minutes into "Xh Ym"
function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return "--";
  const total = Math.round(Number(minutes));
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

// Helper: Clean Activity Type
function formatActivityType(raw) {
  if (!raw) return "Unknown";
  return raw
    .replace(/^Ongoing/i, "")
    .replace(/([A-Z])/g, " $1")
    .trim();
}

// Helper: Clean Connection Name
function formatConnection(raw) {
  if (!raw) return "Unknown";
  if (raw.toLowerCase().includes("cellular")) return "Cellular";
  if (raw.toLowerCase().includes("base")) return "Fi Base";
  if (raw.toLowerCase().includes("bluetooth")) return "Phone Bluetooth";
  return raw.replace(/^ConnectedTo/i, "").replace(/([A-Z])/g, " $1").trim();
}
class PassablePetCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {},
      _currentView: { type: String }, // 'overview', 'activity', 'wellness', 'location'
      _animDirection: { type: String },
      _toastMsg: { type: String },
      _selectedTimeframe: { type: String }, // 'daily', 'weekly', 'monthly'
      _showColorPicker: { type: Boolean },
      _confirmModal: { type: Object },
    };
  }

  constructor() {
    super();
    this._currentView = "overview";
    this._animDirection = "none";
    this._toastMsg = null;
    this._selectedTimeframe = "daily";
    this._showColorPicker = false;
    this._confirmModal = null;
    this._touchStartX = null;
    this._touchStartY = null;
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this.config = {
      title: config.title || config.name || "",
      subtitle: config.subtitle || "",
      step_goal: parseInt(config.step_goal) || 15000,
      distance_unit: config.distance_unit || "auto", // 'auto', 'km', 'mi'
      icon: config.icon || "mdi:paw",
      image: config.image || "",
      prefix: config.prefix || "",
      entity: config.entity || config.tracker || "",
      ...config,
    };
  }

  getCardSize() {
    return 7;
  }

  static getConfigElement() {
    return document.createElement("passable-pet-card-editor");
  }

  static getStubConfig(hass) {
    let defaultEntity = "";
    if (hass && hass.states) {
      for (const eid of Object.keys(hass.states)) {
        if (eid.startsWith("device_tracker.") && (eid.includes("hudson") || eid.includes("collar") || eid.endsWith("_tracker"))) {
          defaultEntity = eid;
          break;
        }
      }
    }
    return {
      title: "Hudson",
      subtitle: "Golden Retriever",
      entity: defaultEntity || "device_tracker.hudson_tracker",
      step_goal: 15000,
      distance_unit: "auto",
    };
  }

  // --- AUTO-DISCOVERY SYSTEM ---
  _discoverEntities() {
    if (!this.hass || !this.hass.states) return {};
    const cfg = this.config || {};
    const allStates = Object.keys(this.hass.states);

    // 1. Determine Pet Prefix Candidates
    const prefixes = new Set();
    if (cfg.prefix) prefixes.add(cfg.prefix.toLowerCase());

    const primary = cfg.entity || cfg.tracker || "";
    if (primary) {
      const objId = primary.split(".")[1] || "";
      const baseName = objId.replace(/_tracker$/, "").replace(/_collar.*$/, "");
      if (baseName) prefixes.add(baseName.toLowerCase());
    }

    // Infer from Title (e.g. "Hudson" -> "hudson")
    if (cfg.title && typeof cfg.title === "string") {
      const cleanTitle = cfg.title.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (cleanTitle && cleanTitle !== "my dog" && cleanTitle !== "my pet" && cleanTitle !== "pet") {
        prefixes.add(cleanTitle);
      }
    }

    // Auto-scan states for unique TryFi collar entities (collar_battery_level, collar_light, lost_mode, tracker)
    for (const entityId of allStates) {
      if (entityId.startsWith("sensor.") && entityId.includes("_collar_battery_level")) {
        const p = entityId.replace("sensor.", "").replace(/_collar_battery_level$/, "");
        if (p) prefixes.add(p.toLowerCase());
      } else if (entityId.startsWith("light.") && entityId.includes("_collar_light")) {
        const p = entityId.replace("light.", "").replace(/_collar_light$/, "");
        if (p) prefixes.add(p.toLowerCase());
      } else if (entityId.startsWith("select.") && entityId.includes("_lost_mode")) {
        const p = entityId.replace("select.", "").replace(/_lost_mode$/, "");
        if (p) prefixes.add(p.toLowerCase());
      } else if (entityId.startsWith("device_tracker.") && entityId.endsWith("_tracker")) {
        const stateObj = this.hass.states[entityId];
        if (stateObj?.attributes?.entity_picture?.includes("tryfi.com") || stateObj?.attributes?.tracking_type === "position") {
          const p = entityId.replace("device_tracker.", "").replace(/_tracker$/, "");
          if (p && !p.startsWith("nmap_")) prefixes.add(p.toLowerCase());
        }
      }
    }

    const pList = Array.from(prefixes);

    const findEntity = (domain, suffixPatterns, manualKey) => {
      if (cfg[manualKey] && this.hass.states[cfg[manualKey]]) {
        return cfg[manualKey];
      }
      for (const p of pList) {
        for (const s of suffixPatterns) {
          const candidate = `${domain}.${p}_${s}`;
          if (this.hass.states[candidate]) return candidate;
        }
      }
      return null;
    };

    // Bases discovery: Look for online sensors created by TryFi integration
    const baseEntities = [];
    if (cfg.bases && Array.isArray(cfg.bases)) {
      baseEntities.push(...cfg.bases);
    } else {
      for (const entityId of allStates) {
        if (entityId.startsWith("sensor.")) {
          const stateObj = this.hass.states[entityId];
          if (stateObj?.attributes?.icon === "mdi:wifi" && (stateObj.state === "Online" || stateObj.state === "Offline")) {
            baseEntities.push(entityId);
          }
        }
      }
    }

    return {
      tracker: findEntity("device_tracker", ["tracker"], "tracker") || primary,
      battery: findEntity("sensor", ["collar_battery_level", "battery_level", "battery"], "battery"),
      charging: findEntity("binary_sensor", ["collar_battery_charging", "battery_charging", "charging"], "charging"),
      light: findEntity("light", ["collar_light", "light"], "light"),
      lost_mode: findEntity("select", ["lost_mode"], "lost_mode"),
      activity_type: findEntity("sensor", ["activity_type"], "activity_type"),
      place_name: findEntity("sensor", ["current_place_name", "place_name"], "place_name"),
      place_address: findEntity("sensor", ["current_place_address", "place_address"], "place_address"),
      connected_to: findEntity("sensor", ["connected_to"], "connected_to"),
      daily_steps: findEntity("sensor", ["daily_steps"], "daily_steps"),
      weekly_steps: findEntity("sensor", ["weekly_steps"], "weekly_steps"),
      monthly_steps: findEntity("sensor", ["monthly_steps"], "monthly_steps"),
      daily_distance: findEntity("sensor", ["daily_distance"], "daily_distance"),
      weekly_distance: findEntity("sensor", ["weekly_distance"], "weekly_distance"),
      monthly_distance: findEntity("sensor", ["monthly_distance"], "monthly_distance"),
      daily_sleep: findEntity("sensor", ["daily_sleep"], "daily_sleep"),
      weekly_sleep: findEntity("sensor", ["weekly_sleep"], "weekly_sleep"),
      monthly_sleep: findEntity("sensor", ["monthly_sleep"], "monthly_sleep"),
      daily_nap: findEntity("sensor", ["daily_nap"], "daily_nap"),
      weekly_nap: findEntity("sensor", ["weekly_nap"], "weekly_nap"),
      monthly_nap: findEntity("sensor", ["monthly_nap"], "monthly_nap"),
      bases: baseEntities,
      detectedPrefix: pList[0] || "",
    };
  }
  // --- ACTIONS & SERVICES ---
  _showToast(msg) {
    this._toastMsg = msg;
    if (this._toastTimeout) clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      this._toastMsg = null;
      this.requestUpdate();
    }, 3000);
    this.requestUpdate();
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(ev);
  }

  _toggleCollarLight(lightEntity) {
    if (!lightEntity || !this.hass) return;
    const isCurrentlyOn = this.hass.states[lightEntity]?.state === "on";
    this.hass.callService("light", "toggle", { entity_id: lightEntity });
    this._showToast(`Collar light turned ${isCurrentlyOn ? "OFF" : "ON"}`);
  }

  _setCollarColor(lightEntity, rgbColor, colorName) {
    if (!lightEntity || !this.hass) return;
    this.hass.callService("light", "turn_on", {
      entity_id: lightEntity,
      rgb_color: rgbColor,
    });
    this._showToast(`Collar LED set to ${colorName}`);
    this._showColorPicker = false;
  }

  _toggleColorPicker() {
    this._showColorPicker = !this._showColorPicker;
  }

  _promptLostMode(lostModeEntity, currentStatus) {
    const isLost = currentStatus?.toLowerCase() === "lost";
    this._confirmModal = {
      entity: lostModeEntity,
      action: isLost ? "Safe" : "Lost",
      title: isLost ? "Deactivate Lost Dog Mode?" : "ACTIVATE LOST DOG MODE?",
      message: isLost
        ? "Return Hudson to normal Safe tracking mode and turn off emergency collar beacon."
        : "⚠️ This enables high-frequency live GPS tracking and pulses the collar LED light to locate your pet immediately. Collar battery consumption will increase significantly.",
      confirmText: isLost ? "Set to Safe" : "ACTIVATE LOST MODE",
      confirmColor: isLost ? "var(--primary-color)" : "var(--error-color, #f44336)",
    };
    this.requestUpdate();
  }

  _executeLostMode() {
    if (!this._confirmModal || !this.hass) return;
    const { entity, action } = this._confirmModal;
    this.hass.callService("select", "select_option", {
      entity_id: entity,
      option: action,
    });
    this._showToast(`Dog status set to: ${action}`);
    this._confirmModal = null;
    this.requestUpdate();
  }

  _closeModal() {
    this._confirmModal = null;
    this.requestUpdate();
  }

  _navigate(view) {
    if (this._currentView === view) return;
    const views = ["overview", "activity", "wellness", "location"];
    const curIdx = views.indexOf(this._currentView);
    const newIdx = views.indexOf(view);
    this._animDirection = newIdx > curIdx ? "slide-left" : "slide-right";
    this._currentView = view;
    this._showColorPicker = false;
    this.requestUpdate();
  }

  _handleTouchStart(e) {
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
  }

  _handleTouchEnd(e) {
    if (this._touchStartX === null || this._touchStartY === null) return;
    const diffX = this._touchStartX - e.changedTouches[0].clientX;
    const diffY = this._touchStartY - e.changedTouches[0].clientY;
    this._touchStartX = null;
    this._touchStartY = null;

    if (Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
      const views = ["overview", "activity", "wellness", "location"];
      const curIdx = views.indexOf(this._currentView);
      if (diffX > 0 && curIdx < views.length - 1) {
        this._navigate(views[curIdx + 1]);
      } else if (diffX < 0 && curIdx > 0) {
        this._navigate(views[curIdx - 1]);
      }
    }
  }

  // --- DISTANCE FORMATTER ---
  _formatDistanceVal(val, origUnit = "km") {
    if (val === null || val === undefined || isNaN(val)) return "--";
    const num = parseFloat(val);
    const targetUnit = this.config.distance_unit;

    if (targetUnit === "mi" && origUnit === "km") {
      const mi = num * 0.621371;
      return `${mi.toFixed(2)} mi`;
    }
    if (targetUnit === "km" && origUnit === "mi") {
      const km = num * 1.60934;
      return `${km.toFixed(2)} km`;
    }
    return `${num.toFixed(2)} ${origUnit || "km"}`;
  }
  // --- MAIN RENDER METHOD ---
  render() {
    if (!this.hass) return html``;

    const entities = this._discoverEntities();
    const trackerObj = entities.tracker ? this.hass.states[entities.tracker] : null;
    const batteryObj = entities.battery ? this.hass.states[entities.battery] : null;
    const chargingObj = entities.charging ? this.hass.states[entities.charging] : null;
    const lostModeObj = entities.lost_mode ? this.hass.states[entities.lost_mode] : null;
    const lightObj = entities.light ? this.hass.states[entities.light] : null;

    // Battery & Charging State
    const batteryLevel = batteryObj ? parseInt(batteryObj.state, 10) : (trackerObj?.attributes?.battery_level ?? null);
    const isCharging = chargingObj ? chargingObj.state === "on" : false;

    // Lost Mode
    const isLost = lostModeObj ? lostModeObj.state?.toLowerCase() === "lost" : false;

    // Pet Names & Details
    let petTitle = this.config.title;
    if (!petTitle) {
      if (trackerObj?.attributes?.friendly_name) {
        petTitle = trackerObj.attributes.friendly_name.replace(/Tracker$/i, "").trim();
      } else if (entities.detectedPrefix) {
        petTitle = entities.detectedPrefix.charAt(0).toUpperCase() + entities.detectedPrefix.slice(1);
      } else {
        petTitle = "My Dog";
      }
    }

    let petSubtitle = this.config.subtitle;
    if (!petSubtitle) {
      petSubtitle = isLost ? "LOST PET BEACON ACTIVE" : "Fi Smart Collar";
    }

    // Status Chip Text & Class
    let chipText = "AT HOME";
    let chipClass = "home";
    if (isLost) {
      chipText = "LOST MODE";
      chipClass = "lost";
    } else if (isCharging) {
      chipText = "CHARGING";
      chipClass = "charging";
    } else if (trackerObj) {
      if (trackerObj.state === "home") {
        chipText = "AT HOME";
        chipClass = "home";
      } else if (trackerObj.state === "not_home" || trackerObj.state === "away") {
        chipText = "AWAY";
        chipClass = "away";
      } else {
        chipText = trackerObj.state.toUpperCase();
        chipClass = "zone";
      }
    }

    // Select view content
    let content;
    switch (this._currentView) {
      case "activity":
        content = this._renderActivityView(entities);
        break;
      case "wellness":
        content = this._renderWellnessView(entities);
        break;
      case "location":
        content = this._renderLocationView(entities, trackerObj, isLost);
        break;
      case "overview":
      default:
        content = this._renderOverviewView(entities, trackerObj, batteryLevel, isCharging, isLost, lightObj);
        break;
    }

    return html`
      <ha-card
        class="${isLost ? "is-lost" : ""}"
        @touchstart=${this._handleTouchStart}
        @touchend=${this._handleTouchEnd}
      >
        <!-- TOAST NOTIFICATION -->
        <div class="toast ${this._toastMsg ? "show" : ""}">
          <ha-icon icon="mdi:check-circle"></ha-icon>
          <span>${this._toastMsg}</span>
        </div>

        <!-- CARD HEADER -->
        <div class="header">
          <div class="header-left">
            <h1 class="title">
              <ha-icon icon="${this.config.icon || "mdi:paw"}" class="title-icon"></ha-icon>
              ${petTitle}
            </h1>
            <p class="subtitle">${petSubtitle}</p>
          </div>
          <div class="header-right">
            <div class="status-chip ${chipClass}">
              ${isLost ? html`<ha-icon icon="mdi:alert" class="alert-icon"></ha-icon>` : ""}
              ${chipText}
            </div>
          </div>
        </div>

        <!-- EXPANDING PILLS NAVIGATION BAR -->
        <div class="nav-bar">
          <div
            class="nav-item ${this._currentView === "overview" ? "active" : ""}"
            @click=${() => this._navigate("overview")}
          >
            <ha-icon icon="mdi:paw"></ha-icon>
            <span>Overview</span>
          </div>
          <div
            class="nav-item ${this._currentView === "activity" ? "active" : ""}"
            @click=${() => this._navigate("activity")}
          >
            <ha-icon icon="mdi:run-fast"></ha-icon>
            <span>Activity</span>
          </div>
          <div
            class="nav-item ${this._currentView === "wellness" ? "active" : ""}"
            @click=${() => this._navigate("wellness")}
          >
            <ha-icon icon="mdi:weather-night"></ha-icon>
            <span>Wellness</span>
          </div>
          <div
            class="nav-item ${this._currentView === "location" ? "active" : ""}"
            @click=${() => this._navigate("location")}
          >
            <ha-icon icon="mdi:crosshairs-gps"></ha-icon>
            <span>Location</span>
          </div>
        </div>

        <!-- VIEW CONTAINER -->
        <div class="card-content">
          ${content}
        </div>

        <!-- CONFIRMATION MODAL (LOST MODE) -->
        ${this._confirmModal ? this._renderConfirmModal() : ""}
      </ha-card>
    `;
  }

  // --- VIEW 1: OVERVIEW ---
  _renderOverviewView(entities, trackerObj, batteryLevel, isCharging, isLost, lightObj) {
    const avatarUrl = this.config.image || trackerObj?.attributes?.entity_picture || "";
    const placeName = entities.place_name ? this.hass.states[entities.place_name]?.state : "Home";
    const placeAddress = entities.place_address ? this.hass.states[entities.place_address]?.state : "";
    const activityRaw = entities.activity_type ? this.hass.states[entities.activity_type]?.state : "Resting";
    const activityClean = formatActivityType(activityRaw);
    const connectedRaw = entities.connected_to ? this.hass.states[entities.connected_to]?.state : "Cellular";
    const connectedClean = formatConnection(connectedRaw);

    // Battery Gauge Geometry (matching passable vehicle card style)
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const batVal = batteryLevel !== null ? batteryLevel : 100;
    const offset = circumference - (Math.min(Math.max(batVal, 0), 100) / 100) * circumference;

    let batColor = "#4CAF50";
    if (batVal <= 20) batColor = "#F44336";
    else if (batVal <= 40) batColor = "#FF9800";

    // Telemetry Values for 2x2 grid
    const stepsVal = entities.daily_steps ? this.hass.states[entities.daily_steps]?.state : null;
    const distState = entities.daily_distance ? this.hass.states[entities.daily_distance] : null;
    const distVal = distState ? this._formatDistanceVal(distState.state, distState.attributes?.unit_of_measurement) : "--";
    const sleepVal = entities.daily_sleep ? formatMinutes(this.hass.states[entities.daily_sleep]?.state) : "--";
    const napVal = entities.daily_nap ? formatMinutes(this.hass.states[entities.daily_nap]?.state) : "--";

    // Collar Light Details
    const isLightOn = lightObj ? lightObj.state === "on" : false;
    const lightRgb = lightObj?.attributes?.rgb_color || [255, 255, 255];
    const lightColorHex = isLightOn ? `rgb(${lightRgb.join(",")})` : "var(--secondary-text-color)";

    return html`
      <div class="view-container overview ${this._animDirection}">
        <!-- HERO SECTION: AVATAR & BATTERY RING -->
        <div class="hero-container">
          <div class="avatar-wrapper ${isLost ? "lost-glow" : ""}">
            ${avatarUrl
              ? html`<img src="${avatarUrl}" alt="Pet Avatar" class="pet-avatar" />`
              : html`<div class="avatar-fallback"><ha-icon icon="mdi:dog-side"></ha-icon></div>`}

            <!-- Battery Ring Overlay -->
            <div
              class="battery-ring-container"
              @click=${() => this._moreInfo(entities.battery)}
              title="Collar Battery: ${batVal}%${isCharging ? ' (Charging)' : ''}"
            >
              <svg class="battery-ring" viewBox="0 0 100 100">
                <circle class="ring-bg" cx="50" cy="50" r="${radius}" />
                <circle
                  class="ring-progress"
                  cx="50"
                  cy="50"
                  r="${radius}"
                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; stroke: ${batColor};"
                />
              </svg>
              <div class="battery-ring-content">
                ${isCharging
                  ? html`<ha-icon icon="mdi:lightning-bolt" class="charge-bolt"></ha-icon>`
                  : html`<span class="ring-val">${batVal}%</span>`}
              </div>
            </div>

            <!-- Activity Badge (Top-Left) -->
            <div class="badge-pill top-left" @click=${() => this._moreInfo(entities.activity_type)}>
              <ha-icon icon="${activityClean.includes("Rest") ? "mdi:sleep" : "mdi:walk"}"></ha-icon>
              <span>${activityClean}</span>
            </div>

            <!-- Connection Badge (Top-Right) -->
            <div class="badge-pill top-right" @click=${() => this._moreInfo(entities.connected_to)}>
              <ha-icon icon="${connectedClean.includes("Base") ? "mdi:wifi" : "mdi:signal-cellular-3"}"></ha-icon>
              <span>${connectedClean}</span>
            </div>
          </div>

          <!-- PLACE & ADDRESS BANNER -->
          <div class="place-banner" @click=${() => this._moreInfo(entities.tracker)}>
            <ha-icon icon="mdi:map-marker-radius" class="place-icon"></ha-icon>
            <div class="place-info">
              <span class="place-title">${placeName}</span>
              ${placeAddress ? html`<span class="place-address">${placeAddress}</span>` : ""}
            </div>
          </div>
        </div>

        <!-- ACTIONABLE COLLAR CONTROLS -->
        <div class="action-controls-row">
          <!-- Collar Light Toggle & Swatches -->
          <div class="control-card light-control ${isLightOn ? "active" : ""}">
            <div class="control-main" @click=${() => this._toggleCollarLight(entities.light)}>
              <div class="led-bulb-indicator" style="background: ${lightColorHex}; box-shadow: ${isLightOn ? `0 0 12px ${lightColorHex}` : 'none'}"></div>
              <div class="control-text">
                <span class="control-label">Collar Light</span>
                <span class="control-status">${isLightOn ? "ON" : "OFF"}</span>
              </div>
            </div>
            ${entities.light
              ? html`
                  <div
                    class="color-palette-btn"
                    @click=${() => this._toggleColorPicker()}
                    title="Change Collar Light Color"
                  >
                    <ha-icon icon="mdi:palette-outline"></ha-icon>
                  </div>
                `
              : ""}
          </div>

          <!-- Lost Dog Mode Trigger -->
          <div
            class="control-card lost-control ${isLost ? "is-lost-active" : ""}"
            @click=${() => this._promptLostMode(entities.lost_mode, isLost ? "Lost" : "Safe")}
          >
            <ha-icon icon="${isLost ? "mdi:alert-decagram" : "mdi:shield-check"}" class="control-icon"></ha-icon>
            <div class="control-text">
              <span class="control-label">${isLost ? "LOST MODE ACTIVE" : "Safety Status"}</span>
              <span class="control-status ${isLost ? "status-danger" : ""}">${isLost ? "TAP TO RESOLVE" : "SAFE"}</span>
            </div>
          </div>
        </div>

        <!-- COLLAR COLOR SWATCHES DRAWER -->
        ${this._showColorPicker && entities.light
          ? html`
              <div class="color-drawer">
                <div class="drawer-title">Choose Collar LED Color:</div>
                <div class="swatch-grid">
                  ${COLLAR_COLORS.map(
                    (c) => html`
                      <div
                        class="color-swatch"
                        style="background-color: ${c.hex}"
                        title="${c.name}"
                        @click=${() => this._setCollarColor(entities.light, c.rgb, c.name)}
                      ></div>
                    `
                  )}
                </div>
              </div>
            `
          : ""}

        <!-- QUICK STATS 2x2 GRID -->
        <div class="stats-grid">
          <div class="stat-tile" @click=${() => this._moreInfo(entities.daily_steps)}>
            <div class="stat-icon-wrapper steps-bg">
              <ha-icon icon="mdi:paw"></ha-icon>
            </div>
            <div class="stat-data">
              <span class="stat-val">${formatNumber(stepsVal)}</span>
              <span class="stat-label">Daily Steps</span>
            </div>
          </div>

          <div class="stat-tile" @click=${() => this._moreInfo(entities.daily_distance)}>
            <div class="stat-icon-wrapper dist-bg">
              <ha-icon icon="mdi:map-marker-distance"></ha-icon>
            </div>
            <div class="stat-data">
              <span class="stat-val">${distVal}</span>
              <span class="stat-label">Daily Distance</span>
            </div>
          </div>

          <div class="stat-tile" @click=${() => this._moreInfo(entities.daily_sleep)}>
            <div class="stat-icon-wrapper sleep-bg">
              <ha-icon icon="mdi:weather-night"></ha-icon>
            </div>
            <div class="stat-data">
              <span class="stat-val">${sleepVal}</span>
              <span class="stat-label">Deep Sleep</span>
            </div>
          </div>

          <div class="stat-tile" @click=${() => this._moreInfo(entities.daily_nap)}>
            <div class="stat-icon-wrapper nap-bg">
              <ha-icon icon="mdi:sleep"></ha-icon>
            </div>
            <div class="stat-data">
              <span class="stat-val">${napVal}</span>
              <span class="stat-label">Naps & Rest</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  // --- VIEW 2: ACTIVITY ---
  _renderActivityView(entities) {
    const tf = this._selectedTimeframe;
    const goal = this.config.step_goal || 15000;

    let stepsEntity = entities.daily_steps;
    let distEntity = entities.daily_distance;

    if (tf === "weekly") {
      stepsEntity = entities.weekly_steps;
      distEntity = entities.weekly_distance;
    } else if (tf === "monthly") {
      stepsEntity = entities.monthly_steps;
      distEntity = entities.monthly_distance;
    }

    const rawSteps = stepsEntity ? parseFloat(this.hass.states[stepsEntity]?.state) || 0 : 0;
    const distState = distEntity ? this.hass.states[distEntity] : null;
    const distDisplay = distState ? this._formatDistanceVal(distState.state, distState.attributes?.unit_of_measurement) : "--";

    // Progress calculations
    const effectiveGoal = tf === "weekly" ? goal * 7 : tf === "monthly" ? goal * 30 : goal;
    const pct = Math.min(Math.round((rawSteps / effectiveGoal) * 100), 100);
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;
    const isGoalAchieved = rawSteps >= effectiveGoal;

    return html`
      <div class="view-container activity ${this._animDirection}">
        <!-- TIMEFRAME SELECTOR -->
        <div class="segmented-control">
          <div
            class="segment ${tf === "daily" ? "active" : ""}"
            @click=${() => { this._selectedTimeframe = "daily"; this.requestUpdate(); }}
          >
            Today
          </div>
          <div
            class="segment ${tf === "weekly" ? "active" : ""}"
            @click=${() => { this._selectedTimeframe = "weekly"; this.requestUpdate(); }}
          >
            Week
          </div>
          <div
            class="segment ${tf === "monthly" ? "active" : ""}"
            @click=${() => { this._selectedTimeframe = "monthly"; this.requestUpdate(); }}
          >
            Month
          </div>
        </div>

        <!-- CENTRAL STEP GOAL RING -->
        <div class="goal-ring-card">
          <div class="goal-ring-wrapper">
            <svg class="goal-svg" viewBox="0 0 140 140">
              <circle class="goal-ring-bg" cx="70" cy="70" r="${radius}" />
              <circle
                class="goal-ring-bar"
                cx="70"
                cy="70"
                r="${radius}"
                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; stroke: ${isGoalAchieved ? '#4CAF50' : 'var(--primary-color)'};"
              />
            </svg>
            <div class="goal-center-text">
              <span class="goal-steps-val">${formatNumber(rawSteps)}</span>
              <span class="goal-steps-unit">steps</span>
              <span class="goal-pct-chip ${isGoalAchieved ? "goal-met" : ""}">${pct}% of goal</span>
            </div>
          </div>

          <div class="goal-stats-row">
            <div class="goal-substat">
              <span class="substat-label">Target Goal</span>
              <span class="substat-val">${formatNumber(effectiveGoal)}</span>
            </div>
            <div class="goal-substat">
              <span class="substat-label">Distance Walked</span>
              <span class="substat-val">${distDisplay}</span>
            </div>
          </div>
        </div>

        <!-- ALL PERIODS COMPARISON TABLE -->
        <div class="card-section-title">Activity Breakdown</div>
        <div class="metrics-row-container">
          <div class="metric-summary-card" @click=${() => this._moreInfo(entities.daily_steps)}>
            <span class="metric-tag">Today</span>
            <span class="metric-main">${formatNumber(entities.daily_steps ? this.hass.states[entities.daily_steps]?.state : null)}</span>
            <span class="metric-sub">${entities.daily_distance ? this._formatDistanceVal(this.hass.states[entities.daily_distance]?.state) : "--"}</span>
          </div>
          <div class="metric-summary-card" @click=${() => this._moreInfo(entities.weekly_steps)}>
            <span class="metric-tag">7-Day</span>
            <span class="metric-main">${formatNumber(entities.weekly_steps ? this.hass.states[entities.weekly_steps]?.state : null)}</span>
            <span class="metric-sub">${entities.weekly_distance ? this._formatDistanceVal(this.hass.states[entities.weekly_distance]?.state) : "--"}</span>
          </div>
          <div class="metric-summary-card" @click=${() => this._moreInfo(entities.monthly_steps)}>
            <span class="metric-tag">30-Day</span>
            <span class="metric-main">${formatNumber(entities.monthly_steps ? this.hass.states[entities.monthly_steps]?.state : null)}</span>
            <span class="metric-sub">${entities.monthly_distance ? this._formatDistanceVal(this.hass.states[entities.monthly_distance]?.state) : "--"}</span>
          </div>
        </div>
      </div>
    `;
  }

  // --- VIEW 3: WELLNESS ---
  _renderWellnessView(entities) {
    const dailySleepMin = entities.daily_sleep ? parseFloat(this.hass.states[entities.daily_sleep]?.state) || 0 : 0;
    const dailyNapMin = entities.daily_nap ? parseFloat(this.hass.states[entities.daily_nap]?.state) || 0 : 0;
    const totalRestMin = dailySleepMin + dailyNapMin;

    const weeklySleepMin = entities.weekly_sleep ? parseFloat(this.hass.states[entities.weekly_sleep]?.state) || 0 : 0;
    const weeklyNapMin = entities.weekly_nap ? parseFloat(this.hass.states[entities.weekly_nap]?.state) || 0 : 0;

    const monthlySleepMin = entities.monthly_sleep ? parseFloat(this.hass.states[entities.monthly_sleep]?.state) || 0 : 0;
    const monthlyNapMin = entities.monthly_nap ? parseFloat(this.hass.states[entities.monthly_nap]?.state) || 0 : 0;

    // Proportions
    const deepSleepPct = totalRestMin > 0 ? Math.round((dailySleepMin / totalRestMin) * 100) : 50;
    const napPct = 100 - deepSleepPct;

    // Daily % of 24 hours spent resting
    const dayTotalMin = 24 * 60;
    const restPctOfDay = Math.min(Math.round((totalRestMin / dayTotalMin) * 100), 100);

    return html`
      <div class="view-container wellness ${this._animDirection}">
        <!-- REST HERO SUMMARY -->
        <div class="wellness-hero-card">
          <div class="wellness-hero-left">
            <div class="wellness-icon-ring">
              <ha-icon icon="mdi:weather-night"></ha-icon>
            </div>
            <div>
              <div class="wellness-title">Total Rest Today</div>
              <div class="wellness-hero-val">${formatMinutes(totalRestMin)}</div>
            </div>
          </div>
          <div class="wellness-badge">
            ${restPctOfDay}% of day
          </div>
        </div>

        <!-- SLEEP VS NAP DUAL BAR -->
        <div class="sleep-ratio-card">
          <div class="ratio-header">
            <span>Sleep Architecture</span>
            <span class="ratio-sub">${deepSleepPct}% Deep / ${napPct}% Naps</span>
          </div>
          <div class="dual-progress-bar">
            <div class="bar-segment deep-sleep" style="width: ${deepSleepPct}%" title="Deep Sleep: ${deepSleepPct}%"></div>
            <div class="bar-segment nap-sleep" style="width: ${napPct}%" title="Naps: ${napPct}%"></div>
          </div>
          <div class="ratio-legend">
            <div class="legend-item">
              <span class="dot deep-dot"></span>
              <span>Deep Sleep (${formatMinutes(dailySleepMin)})</span>
            </div>
            <div class="legend-item">
              <span class="dot nap-dot"></span>
              <span>Naps (${formatMinutes(dailyNapMin)})</span>
            </div>
          </div>
        </div>

        <!-- HISTORICAL REST BREAKDOWN -->
        <div class="card-section-title">Rest History</div>
        <div class="wellness-history-grid">
          <div class="history-card" @click=${() => this._moreInfo(entities.daily_sleep)}>
            <span class="hist-label">Today</span>
            <span class="hist-val">${formatMinutes(totalRestMin)}</span>
            <span class="hist-sub">Sleep: ${formatMinutes(dailySleepMin)}</span>
            <span class="hist-sub">Nap: ${formatMinutes(dailyNapMin)}</span>
          </div>
          <div class="history-card" @click=${() => this._moreInfo(entities.weekly_sleep)}>
            <span class="hist-label">This Week</span>
            <span class="hist-val">${formatMinutes(weeklySleepMin + weeklyNapMin)}</span>
            <span class="hist-sub">Sleep: ${formatMinutes(weeklySleepMin)}</span>
            <span class="hist-sub">Nap: ${formatMinutes(weeklyNapMin)}</span>
          </div>
          <div class="history-card" @click=${() => this._moreInfo(entities.monthly_sleep)}>
            <span class="hist-label">This Month</span>
            <span class="hist-val">${formatMinutes(monthlySleepMin + monthlyNapMin)}</span>
            <span class="hist-sub">Sleep: ${formatMinutes(monthlySleepMin)}</span>
            <span class="hist-sub">Nap: ${formatMinutes(monthlyNapMin)}</span>
          </div>
        </div>
      </div>
    `;
  }

  // --- VIEW 4: LOCATION & BASES ---
  _renderLocationView(entities, trackerObj, isLost) {
    const placeName = entities.place_name ? this.hass.states[entities.place_name]?.state : "Unknown Place";
    const placeAddress = entities.place_address ? this.hass.states[entities.place_address]?.state : "";
    const lat = trackerObj?.attributes?.latitude;
    const lon = trackerObj?.attributes?.longitude;
    const accuracy = trackerObj?.attributes?.gps_accuracy;
    const zone = trackerObj?.attributes?.in_zones ? trackerObj.attributes.in_zones.join(", ") : trackerObj?.state || "Unknown";
    const connectedRaw = entities.connected_to ? this.hass.states[entities.connected_to]?.state : "Unknown";
    const connectedClean = formatConnection(connectedRaw);

    const hasCoords = lat !== undefined && lon !== undefined && lat !== null && lon !== null;

    return html`
      <div class="view-container location ${this._animDirection}">
        <!-- LOCATION CARD -->
        <div class="location-card">
          <div class="location-card-header">
            <ha-icon icon="mdi:map-marker" class="loc-pin"></ha-icon>
            <div class="loc-titles">
              <span class="loc-primary">${placeName}</span>
              ${placeAddress ? html`<span class="loc-secondary">${placeAddress}</span>` : ""}
            </div>
            <div class="loc-zone-chip">${zone}</div>
          </div>

          ${hasCoords
            ? html`
                <div class="coords-row">
                  <div class="coord-item">
                    <span class="coord-label">Coordinates</span>
                    <span class="coord-val">${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}</span>
                  </div>
                  ${accuracy !== undefined
                    ? html`
                        <div class="coord-item">
                          <span class="coord-label">GPS Accuracy</span>
                          <span class="coord-val">&plusmn;${accuracy} m</span>
                        </div>
                      `
                    : ""}
                </div>
                <div class="map-action-row">
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="map-btn"
                  >
                    <ha-icon icon="mdi:google-maps"></ha-icon>
                    <span>Open in Google Maps</span>
                  </a>
                </div>
              `
            : ""}
        </div>

        <!-- CONNECTION & SIGNAL STATUS -->
        <div class="connection-status-card">
          <div class="conn-item">
            <ha-icon icon="mdi:radio-tower" class="conn-icon"></ha-icon>
            <div class="conn-details">
              <span class="conn-title">Collar Connection</span>
              <span class="conn-val">${connectedClean}</span>
            </div>
          </div>
        </div>

        <!-- TRYFI BASE STATIONS -->
        ${entities.bases && entities.bases.length > 0
          ? html`
              <div class="card-section-title">Fi Base Stations</div>
              <div class="bases-grid">
                ${entities.bases.map((baseId) => {
                  const stateObj = this.hass.states[baseId];
                  const isOnline = stateObj?.state?.toLowerCase() === "online";
                  const baseName = stateObj?.attributes?.friendly_name || baseId.split(".")[1].replace(/_/g, " ");
                  return html`
                    <div class="base-card" @click=${() => this._moreInfo(baseId)}>
                      <ha-icon
                        icon="mdi:wifi"
                        style="color: ${isOnline ? 'var(--success-color, #4CAF50)' : 'var(--error-color, #F44336)'}"
                      ></ha-icon>
                      <span class="base-name">${baseName}</span>
                      <span class="base-status ${isOnline ? 'online' : 'offline'}">${stateObj?.state || 'Unknown'}</span>
                    </div>
                  `;
                })}
              </div>
            `
          : ""}

        <!-- EMERGENCY TRIGGER -->
        <div
          class="emergency-lost-trigger ${isLost ? 'active' : ''}"
          @click=${() => this._promptLostMode(entities.lost_mode, isLost ? "Lost" : "Safe")}
        >
          <ha-icon icon="mdi:alert-octagon"></ha-icon>
          <span>${isLost ? "DEACTIVATE LOST DOG MODE" : "ACTIVATE EMERGENCY LOST MODE"}</span>
        </div>
      </div>
    `;
  }

  // --- CONFIRMATION MODAL ---
  _renderConfirmModal() {
    if (!this._confirmModal) return html``;
    const { title, message, confirmText, confirmColor } = this._confirmModal;

    return html`
      <div class="modal-backdrop" @click=${() => this._closeModal()}>
        <div class="modal-box" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <ha-icon icon="mdi:alert-circle" style="color: ${confirmColor}"></ha-icon>
            <h3 class="modal-title">${title}</h3>
          </div>
          <p class="modal-body">${message}</p>
          <div class="modal-actions">
            <button class="modal-btn btn-cancel" @click=${() => this._closeModal()}>Cancel</button>
            <button
              class="modal-btn btn-confirm"
              style="background: ${confirmColor}"
              @click=${() => this._executeLostMode()}
            >
              ${confirmText}
            </button>
          </div>
        </div>
      </div>
    `;
  }
  // --- STYLES ---
  static get styles() {
    return css`
      :host {
        display: block;
        width: 100%;
        box-sizing: border-box;
      }

      ha-card {
        background: var(--ha-card-background, #fff);
        box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.08));
        overflow: hidden;
        color: var(--primary-text-color);
        border-radius: var(--ha-card-border-radius, 16px);
        display: flex;
        flex-direction: column;
        position: relative;
        width: 100%;
        box-sizing: border-box;
        transition: border 0.3s ease, box-shadow 0.3s ease;
      }

      ha-card.is-lost {
        border: 2px solid #F44336;
        box-shadow: 0 0 16px rgba(244, 67, 54, 0.4);
      }

      /* TOAST NOTIFICATION */
      .toast {
        position: absolute;
        top: 16px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: rgba(30, 30, 30, 0.95);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 0.85em;
        font-weight: 500;
        pointer-events: none;
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      }
      .toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* HEADER */
      .header {
        padding: 16px 16px 0;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        padding-bottom: 14px;
        margin-bottom: 12px;
        flex-shrink: 0;
      }
      .header-left {
        display: flex;
        flex-direction: column;
      }
      .title {
        font-size: 24px;
        font-weight: 600;
        margin: 0;
        letter-spacing: -0.01em;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .title-icon {
        color: var(--primary-color, #ff9800);
      }
      .subtitle {
        color: var(--secondary-text-color, #757575);
        font-size: 13px;
        margin-top: 2px;
        margin-bottom: 0;
        font-weight: 400;
      }
      .status-chip {
        font-size: 11px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .status-chip.home {
        background: rgba(76, 175, 80, 0.15);
        color: #4CAF50;
      }
      .status-chip.away {
        background: rgba(33, 150, 243, 0.15);
        color: #2196F3;
      }
      .status-chip.charging {
        background: rgba(255, 152, 0, 0.18);
        color: #FF9800;
      }
      .status-chip.lost {
        background: rgba(244, 67, 54, 0.2);
        color: #F44336;
        animation: pulseAlert 1.5s infinite;
      }
      .alert-icon {
        --mdc-icon-size: 14px;
      }

      /* EXPANDING PILLS NAVIGATION BAR */
      .nav-bar {
        display: flex;
        justify-content: center;
        gap: 16px;
        background: transparent;
        padding: 0 16px 12px 16px;
        margin-bottom: 8px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        flex-shrink: 0;
      }
      .nav-item {
        padding: 8px 14px;
        cursor: pointer;
        color: var(--secondary-text-color);
        border-radius: 24px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
      }
      .nav-item:hover {
        background-color: rgba(var(--primary-color-rgb, 255, 152, 0), 0.08);
      }
      .nav-item.active {
        background-color: var(--primary-color, #ff9800);
        color: var(--text-primary-color, #fff);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      }
      .nav-item ha-icon {
        --mdc-icon-size: 20px;
      }
      .nav-item span {
        max-width: 0;
        opacity: 0;
        overflow: hidden;
        white-space: nowrap;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-weight: 600;
        font-size: 0.82em;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .nav-item.active span {
        max-width: 90px;
        opacity: 1;
        margin-left: 8px;
      }

      /* CARD CONTENT */
      .card-content {
        padding: 8px 16px 16px;
        box-sizing: border-box;
        position: relative;
        width: 100%;
      }

      .view-container {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        animation-duration: 0.3s;
        animation-fill-mode: both;
      }
      .slide-left {
        animation-name: slideInLeft;
      }
      .slide-right {
        animation-name: slideInRight;
      }

      @keyframes slideInLeft {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes slideInRight {
        from { opacity: 0; transform: translateX(-20px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes pulseAlert {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.05); opacity: 0.8; }
      }

      /* HERO SECTION (OVERVIEW) */
      .hero-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        width: 100%;
      }
      .avatar-wrapper {
        position: relative;
        width: 160px;
        height: 160px;
        border-radius: 50%;
        padding: 4px;
        background: linear-gradient(135deg, rgba(var(--primary-color-rgb, 255, 152, 0), 0.3), rgba(0,0,0,0.05));
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .avatar-wrapper.lost-glow {
        box-shadow: 0 0 20px rgba(244, 67, 54, 0.6);
        animation: pulseAlert 1.5s infinite;
      }
      .pet-avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
      }
      .avatar-fallback {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--secondary-background-color, #f5f5f5);
      }
      .avatar-fallback ha-icon {
        --mdc-icon-size: 72px;
        color: var(--secondary-text-color);
      }

      /* BATTERY RING OVERLAY */
      .battery-ring-container {
        position: absolute;
        bottom: -6px;
        right: -6px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: var(--ha-card-background, #fff);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2;
      }
      .battery-ring {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }
      .ring-bg {
        fill: none;
        stroke: var(--divider-color, #e0e0e0);
        stroke-width: 8;
      }
      .ring-progress {
        fill: none;
        stroke-width: 8;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.5s ease;
      }
      .battery-ring-content {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ring-val {
        font-size: 13px;
        font-weight: 700;
        color: var(--primary-text-color);
      }
      .charge-bolt {
        --mdc-icon-size: 20px;
        color: #FF9800;
        animation: pulseAlert 1s infinite;
      }

      /* BADGES */
      .badge-pill {
        position: absolute;
        background: var(--ha-card-background, #fff);
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        z-index: 2;
      }
      .badge-pill ha-icon {
        --mdc-icon-size: 14px;
        color: var(--primary-color, #ff9800);
      }
      .badge-pill.top-left {
        top: 0px;
        left: -15px;
      }
      .badge-pill.top-right {
        top: 0px;
        right: -15px;
      }

      /* PLACE BANNER */
      .place-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
        padding: 8px 14px;
        border-radius: 12px;
        cursor: pointer;
        width: 100%;
        box-sizing: border-box;
      }
      .place-icon {
        color: var(--primary-color, #ff9800);
        --mdc-icon-size: 22px;
      }
      .place-info {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .place-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .place-address {
        font-size: 11px;
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ACTION CONTROLS ROW */
      .action-controls-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        width: 100%;
      }
      .control-card {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.03));
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.08));
        border-radius: 12px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .control-card:hover {
        background: rgba(var(--primary-color-rgb, 255, 152, 0), 0.06);
        border-color: var(--primary-color, #ff9800);
      }
      .control-main {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-grow: 1;
      }
      .led-bulb-indicator {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid rgba(0,0,0,0.1);
        transition: all 0.3s ease;
      }
      .control-text {
        display: flex;
        flex-direction: column;
      }
      .control-label {
        font-size: 11px;
        color: var(--secondary-text-color);
        font-weight: 500;
      }
      .control-status {
        font-size: 13px;
        font-weight: 700;
        color: var(--primary-text-color);
      }
      .control-status.status-danger {
        color: #F44336;
      }
      .color-palette-btn {
        padding: 4px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--secondary-text-color);
      }
      .color-palette-btn:hover {
        color: var(--primary-color, #ff9800);
        background: rgba(0,0,0,0.06);
      }
      .control-icon {
        --mdc-icon-size: 22px;
        color: #4CAF50;
        margin-right: 8px;
      }
      .control-card.is-lost-active {
        background: rgba(244, 67, 54, 0.12);
        border-color: #F44336;
      }
      .control-card.is-lost-active .control-icon {
        color: #F44336;
      }

      /* COLOR SWATCH DRAWER */
      .color-drawer {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
        padding: 10px 12px;
        border-radius: 12px;
        width: 100%;
        box-sizing: border-box;
      }
      .drawer-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--secondary-text-color);
        margin-bottom: 8px;
      }
      .swatch-grid {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .color-swatch {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        border: 2px solid #fff;
        transition: transform 0.15s ease;
      }
      .color-swatch:hover {
        transform: scale(1.2);
      }
      /* STATS GRID */
      .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        width: 100%;
      }
      .stat-tile {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.03));
        border-radius: 12px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        transition: transform 0.15s ease;
      }
      .stat-tile:hover {
        transform: translateY(-2px);
      }
      .stat-icon-wrapper {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .stat-icon-wrapper ha-icon {
        --mdc-icon-size: 20px;
      }
      .steps-bg { background: rgba(76, 175, 80, 0.15); color: #4CAF50; }
      .dist-bg { background: rgba(33, 150, 243, 0.15); color: #2196F3; }
      .sleep-bg { background: rgba(103, 58, 183, 0.15); color: #673AB7; }
      .nap-bg { background: rgba(255, 152, 0, 0.15); color: #FF9800; }

      .stat-data {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .stat-val {
        font-size: 15px;
        font-weight: 700;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .stat-label {
        font-size: 11px;
        color: var(--secondary-text-color);
      }

      /* ACTIVITY VIEW STYLES */
      .segmented-control {
        display: flex;
        background: var(--secondary-background-color, rgba(0,0,0,0.06));
        border-radius: 12px;
        padding: 3px;
        width: 100%;
        box-sizing: border-box;
      }
      .segment {
        flex: 1;
        text-align: center;
        padding: 6px 0;
        font-size: 12px;
        font-weight: 600;
        border-radius: 9px;
        cursor: pointer;
        color: var(--secondary-text-color);
        transition: all 0.2s ease;
      }
      .segment.active {
        background: var(--ha-card-background, #fff);
        color: var(--primary-text-color);
        box-shadow: 0 1px 4px rgba(0,0,0,0.12);
      }

      .goal-ring-card {
        background: var(--secondary-background-color, rgba(0,0,0,0.03));
        border-radius: 14px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .goal-ring-wrapper {
        position: relative;
        width: 140px;
        height: 140px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .goal-svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }
      .goal-ring-bg {
        fill: none;
        stroke: var(--divider-color, #e0e0e0);
        stroke-width: 10;
      }
      .goal-ring-bar {
        fill: none;
        stroke-width: 10;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.6s ease;
      }
      .goal-center-text {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .goal-steps-val {
        font-size: 22px;
        font-weight: 800;
        color: var(--primary-text-color);
        line-height: 1.1;
      }
      .goal-steps-unit {
        font-size: 11px;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .goal-pct-chip {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 8px;
        background: rgba(var(--primary-color-rgb, 255, 152, 0), 0.15);
        color: var(--primary-color, #ff9800);
        margin-top: 4px;
      }
      .goal-pct-chip.goal-met {
        background: rgba(76, 175, 80, 0.18);
        color: #4CAF50;
      }
      .goal-stats-row {
        display: flex;
        justify-content: space-around;
        width: 100%;
        border-top: 1px solid var(--divider-color, rgba(0,0,0,0.08));
        padding-top: 10px;
      }
      .goal-substat {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .substat-label {
        font-size: 11px;
        color: var(--secondary-text-color);
      }
      .substat-val {
        font-size: 14px;
        font-weight: 700;
        color: var(--primary-text-color);
      }

      .card-section-title {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--secondary-text-color);
        margin-top: 4px;
      }
      .metrics-row-container {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
      }
      .metric-summary-card {
        background: var(--secondary-background-color, rgba(0,0,0,0.03));
        border-radius: 10px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
      }
      .metric-tag {
        font-size: 11px;
        font-weight: 600;
        color: var(--secondary-text-color);
      }
      .metric-main {
        font-size: 14px;
        font-weight: 700;
        color: var(--primary-text-color);
      }
      .metric-sub {
        font-size: 10px;
        color: var(--secondary-text-color);
      }

      /* WELLNESS VIEW */
      .wellness-hero-card {
        background: linear-gradient(135deg, rgba(103, 58, 183, 0.1), rgba(33, 150, 243, 0.05));
        border-radius: 14px;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .wellness-hero-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .wellness-icon-ring {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: rgba(103, 58, 183, 0.15);
        color: #673AB7;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .wellness-icon-ring ha-icon {
        --mdc-icon-size: 24px;
      }
      .wellness-title {
        font-size: 12px;
        color: var(--secondary-text-color);
        font-weight: 500;
      }
      .wellness-hero-val {
        font-size: 20px;
        font-weight: 800;
        color: var(--primary-text-color);
      }
      .wellness-badge {
        background: rgba(103, 58, 183, 0.15);
        color: #673AB7;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 700;
      }

      .sleep-ratio-card {
        background: var(--secondary-background-color, rgba(0,0,0,0.03));
        border-radius: 12px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .ratio-header {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
      }
      .ratio-sub {
        color: var(--secondary-text-color);
      }
      .dual-progress-bar {
        height: 10px;
        border-radius: 5px;
        background: rgba(0,0,0,0.08);
        overflow: hidden;
        display: flex;
      }
      .bar-segment.deep-sleep {
        background: #673AB7;
      }
      .bar-segment.nap-sleep {
        background: #00BCD4;
      }
      .ratio-legend {
        display: flex;
        gap: 16px;
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .deep-dot { background: #673AB7; }
      .nap-dot { background: #00BCD4; }

      .wellness-history-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
      }
      .history-card {
        background: var(--secondary-background-color, rgba(0,0,0,0.03));
        border-radius: 10px;
        padding: 10px 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
      }
      .hist-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--secondary-text-color);
      }
      .hist-val {
        font-size: 14px;
        font-weight: 700;
        color: var(--primary-text-color);
        margin: 2px 0;
      }
      .hist-sub {
        font-size: 10px;
        color: var(--secondary-text-color);
      }

      /* LOCATION VIEW */
      .location-card {
        background: var(--secondary-background-color, rgba(0,0,0,0.03));
        border-radius: 14px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .location-card-header {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .loc-pin {
        --mdc-icon-size: 26px;
        color: var(--primary-color, #ff9800);
      }
      .loc-titles {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        overflow: hidden;
      }
      .loc-primary {
        font-size: 15px;
        font-weight: 700;
        color: var(--primary-text-color);
      }
      .loc-secondary {
        font-size: 11px;
        color: var(--secondary-text-color);
      }
      .loc-zone-chip {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 10px;
        background: rgba(76, 175, 80, 0.15);
        color: #4CAF50;
        text-transform: uppercase;
      }
      .coords-row {
        display: flex;
        justify-content: space-between;
        border-top: 1px solid var(--divider-color, rgba(0,0,0,0.06));
        padding-top: 8px;
      }
      .coord-item {
        display: flex;
        flex-direction: column;
      }
      .coord-label {
        font-size: 10px;
        color: var(--secondary-text-color);
      }
      .coord-val {
        font-size: 12px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .map-action-row {
        display: flex;
        justify-content: flex-end;
      }
      .map-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--primary-color, #ff9800);
        color: var(--text-primary-color, #fff);
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
      }
      .map-btn ha-icon {
        --mdc-icon-size: 16px;
      }

      .connection-status-card {
        background: var(--secondary-background-color, rgba(0,0,0,0.03));
        border-radius: 12px;
        padding: 10px 14px;
      }
      .conn-item {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .conn-icon {
        color: var(--primary-color, #ff9800);
        --mdc-icon-size: 22px;
      }
      .conn-details {
        display: flex;
        flex-direction: column;
      }
      .conn-title {
        font-size: 11px;
        color: var(--secondary-text-color);
      }
      .conn-val {
        font-size: 13px;
        font-weight: 700;
      }

      .bases-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .base-card {
        background: var(--secondary-background-color, rgba(0,0,0,0.03));
        border-radius: 10px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        cursor: pointer;
      }
      .base-name {
        font-size: 12px;
        font-weight: 600;
        text-transform: capitalize;
      }
      .base-status {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 8px;
      }
      .base-status.online { background: rgba(76, 175, 80, 0.15); color: #4CAF50; }
      .base-status.offline { background: rgba(244, 67, 54, 0.15); color: #F44336; }

      .emergency-lost-trigger {
        margin-top: 4px;
        background: rgba(244, 67, 54, 0.1);
        border: 1px solid #F44336;
        color: #F44336;
        border-radius: 12px;
        padding: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .emergency-lost-trigger:hover {
        background: #F44336;
        color: white;
      }
      .emergency-lost-trigger.active {
        background: #F44336;
        color: white;
        animation: pulseAlert 1.5s infinite;
      }

      /* MODAL DIALOG */
      .modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(3px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 20;
        padding: 16px;
      }
      .modal-box {
        background: var(--ha-card-background, #fff);
        border-radius: 16px;
        padding: 20px;
        width: 100%;
        max-width: 320px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .modal-header {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .modal-header ha-icon {
        --mdc-icon-size: 26px;
      }
      .modal-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
      }
      .modal-body {
        margin: 0;
        font-size: 13px;
        color: var(--secondary-text-color);
        line-height: 1.4;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 4px;
      }
      .modal-btn {
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        border: none;
        cursor: pointer;
      }
      .btn-cancel {
        background: var(--secondary-background-color, #eee);
        color: var(--primary-text-color);
      }
      .btn-confirm {
        color: white;
      }
    `;
  }
}
// --- VISUAL UI CONFIGURATION EDITOR ---
class PassablePetCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
      _advancedOpen: { type: Boolean },
    };
  }

  constructor() {
    super();
    this._advancedOpen = false;
  }

  setConfig(config) {
    this._config = config || {};
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) return;
    const target = ev.target;
    const configValue = target.configValue || target.getAttribute("configValue");
    if (!configValue) return;

    const value = ev.detail && ev.detail.value !== undefined ? ev.detail.value : target.value;
    if (this._config[configValue] === value) return;

    let newConfig = { ...this._config };
    if (value === "" || value === undefined || value === null) {
      delete newConfig[configValue];
    } else {
      newConfig[configValue] = value;
    }

    this._config = newConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config: this._config } })
    );
  }

  _renderEntityPicker(configValue, label, domainFilter = null, helpText = "") {
    const currentValue = this._config[configValue] || "";
    return html`
      <div class="option-row">
        <label class="label">${label}</label>
        <ha-entity-picker
          .hass=${this.hass}
          .value=${currentValue}
          .configValue=${configValue}
          .includeDomains=${domainFilter}
          @value-changed=${this._valueChanged}
          allow-custom-entity
        ></ha-entity-picker>
        ${helpText ? html`<span class="help-text">${helpText}</span>` : ""}
      </div>
    `;
  }

  render() {
    if (!this.hass) return html``;

    return html`
      <div class="card-config">
        <!-- BASIC CONFIGURATION -->
        <div class="option-row">
          <label class="label">Pet Name (Title)</label>
          <input
            class="input-text"
            .value=${this._config.title || ""}
            .configValue=${"title"}
            @input=${this._valueChanged}
            placeholder="Auto-discovered (e.g. Hudson)"
          />
        </div>

        <div class="option-row">
          <label class="label">Subtitle (Breed / Description)</label>
          <input
            class="input-text"
            .value=${this._config.subtitle || ""}
            .configValue=${"subtitle"}
            @input=${this._valueChanged}
            placeholder="e.g. Golden Retriever"
          />
        </div>

        ${this._renderEntityPicker(
          "entity",
          "Primary Pet Tracker",
          ["device_tracker"],
          "Select the collar tracker (e.g. device_tracker.hudson_tracker) to auto-discover all entities!"
        )}

        <div class="option-row">
          <label class="label">Daily Step Goal</label>
          <input
            class="input-text"
            type="number"
            .value=${this._config.step_goal || 15000}
            .configValue=${"step_goal"}
            @input=${this._valueChanged}
            placeholder="15000"
          />
        </div>

        <div class="option-row">
          <label class="label">Distance Unit</label>
          <select
            class="input-select"
            .value=${this._config.distance_unit || "auto"}
            .configValue=${"distance_unit"}
            @change=${this._valueChanged}
          >
            <option value="auto">Auto (from sensor)</option>
            <option value="km">Kilometers (km)</option>
            <option value="mi">Miles (mi)</option>
          </select>
        </div>

        <div class="option-row">
          <label class="label">Custom Avatar Photo URL (Optional)</label>
          <input
            class="input-text"
            .value=${this._config.image || ""}
            .configValue=${"image"}
            @input=${this._valueChanged}
            placeholder="https://... or /local/pet.jpg (leave blank for Fi avatar)"
          />
        </div>

        <!-- ADVANCED ENTITY OVERRIDES -->
        <div
          class="accordion-header"
          @click=${() => { this._advancedOpen = !this._advancedOpen; this.requestUpdate(); }}
        >
          <span>Manual Entity Overrides (Optional)</span>
          <ha-icon icon="${this._advancedOpen ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon>
        </div>

        ${this._advancedOpen
          ? html`
              <div class="accordion-content">
                ${this._renderEntityPicker("battery", "Collar Battery Sensor", ["sensor"])}
                ${this._renderEntityPicker("charging", "Collar Charging Sensor", ["binary_sensor"])}
                ${this._renderEntityPicker("light", "Collar LED Light", ["light"])}
                ${this._renderEntityPicker("lost_mode", "Lost Mode Select", ["select"])}
                ${this._renderEntityPicker("activity_type", "Activity Type Sensor", ["sensor"])}
                ${this._renderEntityPicker("place_name", "Current Place Name Sensor", ["sensor"])}
                ${this._renderEntityPicker("place_address", "Current Place Address Sensor", ["sensor"])}
                ${this._renderEntityPicker("connected_to", "Connected To Sensor", ["sensor"])}
                ${this._renderEntityPicker("daily_steps", "Daily Steps Sensor", ["sensor"])}
                ${this._renderEntityPicker("daily_distance", "Daily Distance Sensor", ["sensor"])}
                ${this._renderEntityPicker("daily_sleep", "Daily Sleep Sensor", ["sensor"])}
                ${this._renderEntityPicker("daily_nap", "Daily Nap Sensor", ["sensor"])}
              </div>
            `
          : ""}
      </div>
    `;
  }

  static get styles() {
    return css`
      .card-config {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 8px 0;
      }
      .option-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .label {
        font-size: 12px;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .help-text {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }
      .input-text, .input-select {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--divider-color, #ccc);
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #000);
        font-size: 14px;
        box-sizing: border-box;
      }
      .input-text:focus, .input-select:focus {
        outline: none;
        border-color: var(--primary-color, #ff9800);
      }
      .accordion-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        background: var(--secondary-background-color, #f5f5f5);
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
        margin-top: 6px;
      }
      .accordion-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 10px 4px;
      }
    `;
  }
}

// Define custom elements
customElements.define("passable-pet-card", PassablePetCard);
customElements.define("passable-pet-card-editor", PassablePetCardEditor);
