// Mirrors the product_status pg enum. It used to say "inactive", which the server rejected —
// every save from the status picker failed silently on the sync pipeline.
export type ProductStatus = "active" | "archived";
