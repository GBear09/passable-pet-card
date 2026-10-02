# Changelog

All notable changes to **Passable Pet Card** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-10-02

### Changed
- **Design System Alignment**: Standardized card border radius to 12px (`var(--ha-card-border-radius, 12px)`) matching the Passable card design package.
- **Header Alignment**: Normalized header padding and divider bottom margin to 16px.
- **Registry Metadata**: Added `documentationURL` linking directly to repository in `window.customCards` registry.
- **Startup Banner**: Normalized console startup logging banner.

## [1.0.1] - 2026-09-15

### Fixed
- Improve auto-discovery to infer prefix from title and scan unique collar entities.

## [1.0.0] - 2026-09-14

### Added
- Initial release of Passable Pet Card for TryFi smart dog collars.
