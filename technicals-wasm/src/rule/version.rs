/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

//! Schema versioning, and the rule that a document is migrated or refused —
//! never silently reinterpreted.
//!
//! ADR-0012 lists "schema versioning becomes permanent work" among the costs it
//! accepts: every armed rule carries the version it was authored under, and
//! every migration must preserve meaning or refuse to migrate. This module is
//! that machinery, built at version 1 so the second version has somewhere to
//! land rather than being bolted on once rules are live on real accounts.

use serde::{Deserialize, Serialize};

use super::refusal::{RefusalCode, RuleRefusal};

/// The version this build authors and evaluates.
pub const CURRENT_SCHEMA_VERSION: u16 = 1;

/// The oldest version this build can still read. Below it, a document is
/// refused rather than guessed at.
pub const MINIMUM_SUPPORTED_VERSION: u16 = 1;

/// A rule document's schema version.
///
/// A newtype rather than a bare `u16` so it cannot be confused with any of the
/// other small integers on a document (period, displacement, count) at a call
/// site.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct SchemaVersion(pub u16);

impl SchemaVersion {
    pub const CURRENT: SchemaVersion = SchemaVersion(CURRENT_SCHEMA_VERSION);

    /// Whether this build can read a document at this version at all.
    pub fn is_supported(self) -> bool {
        self.0 >= MINIMUM_SUPPORTED_VERSION && self.0 <= CURRENT_SCHEMA_VERSION
    }

    /// Refuse, naming the version, when this build cannot read the document.
    ///
    /// The two directions fail for different reasons and the message says which:
    /// a version from the future means the app is behind, a withdrawn version
    /// means the document is older than any migration path that survived.
    pub fn check_readable(self, field: &str) -> Result<(), RuleRefusal> {
        if self.0 > CURRENT_SCHEMA_VERSION {
            return Err(RuleRefusal::new(
                RefusalCode::UnsupportedSchemaVersion,
                field,
                format!(
                    "document is schema version {}, this build reads up to {}. \
                     Update the app rather than editing the document.",
                    self.0, CURRENT_SCHEMA_VERSION
                ),
            ));
        }
        if self.0 < MINIMUM_SUPPORTED_VERSION {
            return Err(RuleRefusal::new(
                RefusalCode::UnsupportedSchemaVersion,
                field,
                format!(
                    "document is schema version {}, older than the oldest version \
                     with a migration path ({})",
                    self.0, MINIMUM_SUPPORTED_VERSION
                ),
            ));
        }
        Ok(())
    }
}

impl Default for SchemaVersion {
    fn default() -> Self {
        Self::CURRENT
    }
}

impl std::fmt::Display for SchemaVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "v{}", self.0)
    }
}

/// One step in the migration chain: version N to version N+1.
///
/// Migrations are expressed over `serde_json::Value` rather than over typed
/// structs because the typed struct for version N stops existing the moment the
/// schema moves on. Keeping N-shaped structs around forever is the alternative,
/// and it is the one that rots — a struct nobody constructs is a struct nobody
/// notices is wrong.
type MigrationStep = fn(&mut serde_json::Value) -> Result<(), RuleRefusal>;

/// The migration chain, indexed by the version being migrated *from*.
///
/// Empty at version 1 by construction: there is nothing before it. The chain
/// exists now, with its tests, so that adding version 2 is filling in a slot
/// rather than designing migration under pressure with rules already armed.
// The single-arm match is the extension point, not an oversight: adding version
// 2 means adding `1 => Some(migrate_v1_to_v2),` here and nowhere else. Collapsing
// it to a bare `None` as clippy suggests would delete the shape that makes that
// obvious.
#[allow(clippy::match_single_binding)]
fn migration_for(from: u16) -> Option<MigrationStep> {
    match from {
        // 1 => Some(migrate_v1_to_v2),
        _ => None,
    }
}

/// Bring a raw document up to [`CURRENT_SCHEMA_VERSION`], or refuse.
///
/// Operates on the untyped JSON before validation, because a document at an
/// older version does not necessarily parse into the current typed shape — that
/// is what a migration is for.
///
/// Refusing is a first-class outcome here, not a failure of the function. A
/// migration that cannot preserve meaning must say so: ADR-0012 forbids silent
/// reinterpretation precisely because the reinterpreted rule would keep running
/// on a funded account under a meaning its author never wrote.
pub fn migrate_to_current(raw: &mut serde_json::Value) -> Result<SchemaVersion, RuleRefusal> {
    let field = "schema_version";

    let mut version = match raw.get(field) {
        Some(v) => {
            let n = v.as_u64().ok_or_else(|| {
                RuleRefusal::new(
                    RefusalCode::UnsupportedSchemaVersion,
                    field,
                    format!("`{v}` is not a schema version number"),
                )
            })?;
            u16::try_from(n).map_err(|_| {
                RuleRefusal::new(
                    RefusalCode::UnsupportedSchemaVersion,
                    field,
                    format!("schema version {n} is out of range"),
                )
            })?
        }
        None => {
            return Err(RuleRefusal::new(
                RefusalCode::UnsupportedSchemaVersion,
                field,
                "document declares no schema version, so the meaning of its \
                 fields is unknown",
            ))
        }
    };

    SchemaVersion(version).check_readable(field)?;

    while version < CURRENT_SCHEMA_VERSION {
        let step = migration_for(version).ok_or_else(|| {
            RuleRefusal::new(
                RefusalCode::MigrationNotPossible,
                field,
                format!(
                    "no migration from schema version {} to {}; the document is \
                     refused rather than reinterpreted",
                    version,
                    version + 1
                ),
            )
        })?;
        step(raw)?;
        version += 1;
        raw[field] = serde_json::json!(version);
    }

    Ok(SchemaVersion(version))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_current_version_document_migrates_to_itself_unchanged() {
        let mut doc = json!({ "schema_version": CURRENT_SCHEMA_VERSION, "name": "x" });
        let before = doc.clone();
        assert_eq!(
            migrate_to_current(&mut doc).unwrap(),
            SchemaVersion::CURRENT
        );
        assert_eq!(doc, before, "a no-op migration must not touch the document");
    }

    #[test]
    fn a_future_version_is_refused_and_says_the_app_is_behind() {
        let mut doc = json!({ "schema_version": CURRENT_SCHEMA_VERSION + 1 });
        let err = migrate_to_current(&mut doc).unwrap_err();
        assert_eq!(err.code, RefusalCode::UnsupportedSchemaVersion);
        assert!(err.detail.contains("Update the app"));
    }

    #[test]
    fn a_document_with_no_version_is_refused_rather_than_assumed_current() {
        let mut doc = json!({ "name": "x" });
        let err = migrate_to_current(&mut doc).unwrap_err();
        assert_eq!(err.code, RefusalCode::UnsupportedSchemaVersion);
        assert_eq!(err.field, "schema_version");
    }

    #[test]
    fn a_non_numeric_version_is_refused() {
        for bad in [json!("1"), json!(null), json!(1.5), json!({}), json!(-1)] {
            let mut doc = json!({ "schema_version": bad });
            assert_eq!(
                migrate_to_current(&mut doc).unwrap_err().code,
                RefusalCode::UnsupportedSchemaVersion
            );
        }
    }

    /// The chain is empty today. This asserts the *shape* of the guarantee, so
    /// that when version 2 lands, a missing step is a refusal rather than a
    /// document that quietly keeps its old meaning under a new version number.
    #[test]
    fn a_gap_in_the_migration_chain_refuses_instead_of_reinterpreting() {
        assert!(
            migration_for(CURRENT_SCHEMA_VERSION).is_none(),
            "there is nothing after the current version to migrate to"
        );
        // A `for` over the range would be an empty literal range today (min ==
        // current), which clippy rejects outright. Written as a while loop it
        // stays a real assertion the moment a second version exists.
        let mut v = MINIMUM_SUPPORTED_VERSION;
        while v < CURRENT_SCHEMA_VERSION {
            assert!(
                migration_for(v).is_some(),
                "schema version {v} is supported but has no migration to {}; \
                 migrate_to_current would refuse every document at that version",
                v + 1
            );
            v += 1;
        }
    }

    /// A compile-time invariant, asserted so that a future edit inverting the
    /// bounds fails here rather than by refusing every document in the field.
    #[test]
    #[allow(clippy::assertions_on_constants)]
    fn version_bounds_are_coherent() {
        assert!(MINIMUM_SUPPORTED_VERSION <= CURRENT_SCHEMA_VERSION);
        assert!(SchemaVersion::CURRENT.is_supported());
        assert!(!SchemaVersion(CURRENT_SCHEMA_VERSION + 1).is_supported());
        assert!(!SchemaVersion(MINIMUM_SUPPORTED_VERSION - 1).is_supported());
    }
}
