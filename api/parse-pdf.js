export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  try {
    const { pdfBase64, type } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: "pdfBase64 is required" });

    // type = "both" (default), "pl", or "bs"
    const mode = type || "both";

    const systemPrompt = `あなたは日本の中小企業の決算書を読み取る専門家です。
PDFから損益計算書(PL)と貸借対照表(BS)のデータを抽出してください。

【ルール】
- 金額は万円単位の数値で返す（千円単位の場合は÷10して万円に変換。円単位の場合は÷10000して万円に変換）
- 複数年度あればすべて抽出
- 年度は西暦4桁（例: "2024"）。"第X期"や"令和X年"は西暦に変換
- 見つからない項目は0とする
- 必ず以下のJSON形式のみで返す。説明文やマークダウンは不要

${mode === "pl" ? "" : `【BS抽出項目】
流動資産, 固定資産, 資産合計, 流動負債, 固定負債, 純資産, 現預金(現金及び預金), 棚卸資産(商品+製品+仕掛品の合計。なければ0)`}

${mode === "bs" ? "" : `【PL抽出項目】
売上高, 売上原価, 売上総利益, 販管費(販売費及び一般管理費), 営業利益, 経常利益, 当期純利益`}

【返却JSON形式】
{
  ${mode !== "bs" ? '"pl": [{"y":"2024","売上高":19600,"売上原価":14700,"売上総利益":4900,"販管費":2400,"営業利益":2500,"経常利益":2350,"当期純利益":1650}]' : ""}${mode === "both" ? "," : ""}
  ${mode !== "pl" ? '"bs": [{"y":"2024","流動資産":28000,"固定資産":28500,"資産合計":56500,"流動負債":10000,"固定負債":18000,"純資産":28500,"現預金":6400,"棚卸資産":9100}]' : ""}
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
              },
              {
                type: "text",
                text: "この決算書のデータを抽出してください。PL(損益計算書)とBS(貸借対照表)の両方が含まれていれば両方、片方だけなら片方を抽出してください。JSONのみで返してください。",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Claude API error:", response.status, errBody);
      return res.status(502).json({ error: `Claude API error: ${response.status}` });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    let jsonStr = text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);

    // Normalize: could be { pl: [...], bs: [...] } or just an array
    const result = {};
    if (Array.isArray(parsed)) {
      // Try to detect if it's PL or BS based on keys
      if (parsed[0]?.売上高 !== undefined) result.pl = parsed;
      if (parsed[0]?.資産合計 !== undefined) result.bs = parsed;
    } else {
      if (parsed.pl) result.pl = parsed.pl;
      if (parsed.bs) result.bs = parsed.bs;
    }

    if (!result.pl && !result.bs) {
      return res.status(422).json({ error: "PL/BSのデータを抽出できませんでした。別のPDFを試してください。" });
    }

    return res.status(200).json(result);
  } catch (e) {
    console.error("Parse PDF error:", e);
    return res.status(500).json({ error: e.message || "PDF解析に失敗しました" });
  }
}
