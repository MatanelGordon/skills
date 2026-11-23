# Glossary

> Words that mean something specific in this project.

<!-- entry:active-item -->
## active-item
---
id: active-item
title: What "active" means for a supplier item
created: 2026-03-30T09:02:15.000Z
updated: 2026-03-30T09:02:15.000Z
tags: [glossary, supplier]
links: [src/importer/supplier.js]
---
In the supplier database an item is "active" when the supplier still sells it,
not when it is in stock. An active item with zero stock stays in the catalog
and shows as unavailable; an inactive item is removed from the storefront.
