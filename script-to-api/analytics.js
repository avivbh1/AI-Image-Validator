import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const main = async () => {
    // Fetch all rows from your table
    const { data: images, error } = await supabase
        .from("image_audit_results")
        .select("*");

    if (error) {
        console.error("Error fetching data:", error.message);
        return;
    }

    if (!images || images.length === 0) {
        console.log("No images found in the table.");
        return;
    }

    // Initialize counters
    let TP = 0, TN = 0, FP = 0, FN = 0;

    images.forEach(img => {
        const predictedAI = img.predicted_is_rejected; // true = predicted AI
        const actualType = img.true_type;              // 'real' or 'ai'

        if (actualType === "ai") {
            predictedAI ? TP++ : FN++;
        } else if (actualType === "real") {
            predictedAI ? FP++ : TN++;
        }
    });

    const total = TP + TN + FP + FN;
    const accuracy = ((TP + TN) / total) * 100;
    const precision = TP + FP > 0 ? TP / (TP + FP) : 0;
    const recall = TP + FN > 0 ? TP / (TP + FN) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    console.log("\n=== Analytics ===");
    console.log(`Total images: ${total}`);
    console.log(`True Positive (AI correctly detected): ${TP}`);
    console.log(`True Negative (Real correctly detected): ${TN}`);
    console.log(`False Positive (Real incorrectly detected as AI): ${FP}`);
    console.log(`False Negative (AI incorrectly detected as Real): ${FN}`);
    console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
    console.log(`Precision: ${precision.toFixed(2)}`);
    console.log(`Recall: ${recall.toFixed(2)}`);
    console.log(`F1-score: ${f1.toFixed(2)}`);
};

main();