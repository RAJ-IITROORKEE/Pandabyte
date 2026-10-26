import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PRODUCT_TABLE_QUERY, parseProductTableQuery, presentProductPrice, serializeProductTableQuery } from "./products-table-query.ts";

test("product table query parses valid filters and serializes them in stable order", () => {
  const query = parseProductTableQuery("?q=%20xC6%20&status=published&categoryId=AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA&sort=price_asc&limit=50&offset=100");

  assert.deepEqual(query, {
    q: "xC6",
    status: "published",
    categoryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sort: "price_asc",
    limit: 50,
    offset: 100,
  });
  assert.equal(
    serializeProductTableQuery(query),
    "q=xC6&status=published&categoryId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&sort=price_asc&limit=50&offset=100",
  );
});

test("product table query rejects unsupported values and unsafe offsets", () => {
  assert.deepEqual(parseProductTableQuery("?q=%20%20&status=visible&categoryId=bad&sort=random&limit=15&offset=9007199254740992"), DEFAULT_PRODUCT_TABLE_QUERY);
  assert.equal(parseProductTableQuery("?offset=-1").offset, 0);
});

test("product table query writes defaults while omitting empty search and category filters", () => {
  assert.equal(
    serializeProductTableQuery(DEFAULT_PRODUCT_TABLE_QUERY),
    "status=all&sort=updated_desc&limit=20&offset=0",
  );
  assert.equal(serializeProductTableQuery({ ...DEFAULT_PRODUCT_TABLE_QUERY, q: "   " }).startsWith("q="), false);
});

test("Admin shows saved source prices and retains source labels", () => {
  assert.deepEqual(presentProductPrice(null, true), {
    current: "Not configured", regular: null, discount: null, sourceObservation: true,
  });
  assert.deepEqual(presentProductPrice(null, false), {
    current: "Not configured", regular: null, discount: null, sourceObservation: false,
  });
  assert.deepEqual(presentProductPrice({ regularPricePaise: 20_000, effectivePricePaise: 15_000, isOnSale: true, from: false }, true), {
    current: "₹150.00", regular: "₹200.00", discount: "25% off", sourceObservation: true,
  });
});

test("product price shows a strike-through and discount only for an active sale", () => {
  assert.deepEqual(presentProductPrice({ regularPricePaise: 10_000, effectivePricePaise: 7_500, isOnSale: true, from: false }, false), {
    current: "₹75.00", regular: "₹100.00", discount: "25% off", sourceObservation: false,
  });
  assert.deepEqual(presentProductPrice({ regularPricePaise: 10_000, effectivePricePaise: 10_000, isOnSale: false, from: false }, false), {
    current: "₹100.00", regular: null, discount: null, sourceObservation: false,
  });
  assert.deepEqual(presentProductPrice({ regularPricePaise: 10_000, effectivePricePaise: 9_999, isOnSale: true, from: true }, false), {
    current: "From ₹99.99", regular: "₹100.00", discount: "Sale", sourceObservation: false,
  });
});
