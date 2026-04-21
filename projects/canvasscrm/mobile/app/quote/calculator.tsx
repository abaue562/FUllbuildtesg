// INSTANT QUOTE CALCULATOR — rep builds a quote at the door in seconds.
// Pulls products from Supabase, lets rep set qty + discount,
// shows live total + rep commission, and fires to New Quote modal.
import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Plus, Minus, Sparkles, X, ChevronRight } from "lucide-react-native";
import { theme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

type Product = { id: string; name: string; base_price: number; unit: string; commission_pct: number };
type Line = { product: Product; qty: number; discount: number };

export default function QuoteCalculator() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [socialProof, setSocialProof] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("products").select("*").eq("active", true).order("sort_order")
      .then(({ data }) => setProducts(data ?? []));
  }, []);

  function addProduct(p: Product) {
    setLines((l) => {
      const ex = l.findIndex((li) => li.product.id === p.id);
      if (ex >= 0) {
        const n = [...l];
        n[ex] = { ...n[ex], qty: n[ex].qty + 1 };
        return n;
      }
      return [...l, { product: p, qty: 1, discount: 0 }];
    });
  }

  function updateLine(idx: number, field: "qty" | "discount", val: number) {
    setLines((l) => { const n = [...l]; n[idx] = { ...n[idx], [field]: Math.max(0, val) }; return n; });
  }

  function removeLine(idx: number) {
    setLines((l) => l.filter((_, i) => i !== idx));
  }

  const subtotal = lines.reduce((s, l) => s + l.product.base_price * l.qty * (1 - l.discount / 100), 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;
  const commission = lines.reduce((s, l) =>
    s + l.product.base_price * l.qty * (1 - l.discount / 100) * (l.product.commission_pct / 100), 0);

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()}><X size={26} color={theme.color.text} /></Pressable>
        <Text style={s.title}>Quote Builder</Text>
        <Sparkles size={22} color={theme.color.text} />
      </View>

      {socialProof && (
        <View style={s.proofBanner}>
          <Text style={s.proofText}>🏠 {socialProof}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        {/* Product Picker */}
        <Text style={s.section}>Add Products</Text>
        <View style={s.productGrid}>
          {products.map((p) => (
            <Pressable key={p.id} onPress={() => addProduct(p)} style={s.productChip}>
              <Text style={s.productName}>{p.name}</Text>
              <Text style={s.productPrice}>${p.base_price.toLocaleString()}/{p.unit}</Text>
            </Pressable>
          ))}
        </View>

        {/* Line Items */}
        {lines.length > 0 && (
          <>
            <Text style={s.section}>Line Items</Text>
            {lines.map((line, i) => (
              <View key={i} style={s.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.lineName}>{line.product.name}</Text>
                  <Text style={s.lineUnit}>${line.product.base_price}/{line.product.unit}</Text>
                </View>
                <View style={s.qtyRow}>
                  <Pressable onPress={() => line.qty > 1 ? updateLine(i, "qty", line.qty - 1) : removeLine(i)}>
                    <Minus size={20} color={theme.color.text} />
                  </Pressable>
                  <Text style={s.qtyNum}>{line.qty}</Text>
                  <Pressable onPress={() => updateLine(i, "qty", line.qty + 1)}>
                    <Plus size={20} color={theme.color.primary} />
                  </Pressable>
                </View>
                <View style={s.discountRow}>
                  <TextInput
                    style={s.discountInput}
                    value={String(line.discount)}
                    onChangeText={(v) => updateLine(i, "discount", Number(v) || 0)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.color.textMute}
                  />
                  <Text style={s.discountLabel}>% off</Text>
                </View>
                <Text style={s.lineTotal}>
                  ${(line.product.base_price * line.qty * (1 - line.discount / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Totals */}
        {lines.length > 0 && (
          <View style={s.totalsCard}>
            {[
              ["Subtotal", `$${subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
              ["Tax (8%)", `$${tax.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
            ].map(([l, v]) => (
              <View key={l} style={s.totalRow}>
                <Text style={s.totalLabel}>{l}</Text>
                <Text style={s.totalValue}>{v}</Text>
              </View>
            ))}
            <View style={[s.totalRow, s.totalFinal]}>
              <Text style={s.totalFinalLabel}>Total</Text>
              <Text style={s.totalFinalValue}>${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
            </View>
            <View style={s.commissionBadge}>
              <Text style={s.commissionText}>Your commission: ${commission.toLocaleString(undefined, { maximumFractionDigits: 0 })}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {lines.length > 0 && (
        <View style={s.footer}>
          <Pressable style={s.cta} onPress={() => router.push({ pathname: "/quote/new", params: { prefill: JSON.stringify(lines) } })}>
            <Text style={s.ctaText}>Review & Send Quote</Text>
            <ChevronRight size={22} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 16 },
  title: { fontSize: 26, fontWeight: "800", color: theme.color.text, flex: 1, marginLeft: 8 },
  proofBanner: { marginHorizontal: 20, marginBottom: 8, padding: 12, backgroundColor: "#E8F5E9", borderRadius: theme.radius.md, borderWidth: 1, borderColor: "#C8E6C9" },
  proofText: { fontSize: 14, color: theme.color.primary, fontWeight: "700" },
  section: { fontSize: 16, color: theme.color.textMute, fontWeight: "600", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  productGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8 },
  productChip: { flexBasis: "47%", flexGrow: 1, padding: 14, backgroundColor: theme.color.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border },
  productName: { fontSize: 15, fontWeight: "800", color: theme.color.text },
  productPrice: { fontSize: 13, color: theme.color.textMute, marginTop: 2 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surface },
  lineName: { fontSize: 15, fontWeight: "700", color: theme.color.text },
  lineUnit: { fontSize: 12, color: theme.color.textMute },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyNum: { fontSize: 17, fontWeight: "800", color: theme.color.text, minWidth: 24, textAlign: "center" },
  discountRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  discountInput: { width: 44, borderWidth: 1, borderColor: theme.color.border, borderRadius: 8, padding: 6, textAlign: "center", fontSize: 14, color: theme.color.text },
  discountLabel: { fontSize: 12, color: theme.color.textMute },
  lineTotal: { fontSize: 16, fontWeight: "800", color: theme.color.text, minWidth: 60, textAlign: "right" },
  totalsCard: { margin: 20, padding: 16, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  totalLabel: { fontSize: 15, color: theme.color.textMute },
  totalValue: { fontSize: 15, color: theme.color.text },
  totalFinal: { borderTopWidth: 1, borderTopColor: theme.color.border, marginTop: 4, paddingTop: 12 },
  totalFinalLabel: { fontSize: 20, fontWeight: "800", color: theme.color.text },
  totalFinalValue: { fontSize: 20, fontWeight: "800", color: theme.color.text },
  commissionBadge: { marginTop: 12, padding: 10, backgroundColor: "#E8F5E9", borderRadius: theme.radius.md, alignItems: "center" },
  commissionText: { fontSize: 15, fontWeight: "800", color: theme.color.primary },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 36, backgroundColor: theme.color.bg, borderTopWidth: 1, borderTopColor: theme.color.border },
  cta: { backgroundColor: theme.color.primary, borderRadius: theme.radius.pill, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ctaText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
