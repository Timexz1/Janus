import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "http://127.0.0.1:54321",
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
);

const email = `node_${Date.now()}@example.com`;
const { data: signup, error: e1 } = await sb.auth.signUp({ email, password: "password123" });
if (e1) { console.log("SIGNUP ERROR", e1); process.exit(1); }
const uid = signup.user.id;
console.log("signed up uid", uid);

await new Promise((r) => setTimeout(r, 500)); // let trigger seed accounts

const { data: accts } = await sb.from("accounts").select("id,broker");
console.log("accounts:", accts);

const row = {
  id: `tx_node_${Date.now()}`,
  user_id: uid,
  account_id: "acc_webull",
  ticker: "NODE",
  side: "buy",
  qty: "1",
  price: "2",
  fees: "0",
  executed_at: new Date().toISOString(),
};
console.log("inserting...");
const { data, error } = await sb.from("transactions").upsert(row, { onConflict: "id" }).select();
console.log("INSERT RESULT:", error ? `ERROR ${JSON.stringify(error)}` : data);
process.exit(0);
