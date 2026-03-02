import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const API_URL = process.env.POST_API_URL;
const folders = [
    { path: process.env.REAL_FOLDER, type: "real" },
    { path: process.env.AI_FOLDER, type: "ai" }
];

let TP = 0, TN = 0, FP = 0, FN = 0;

const uploadImage = async (filePath, type) => {
    const fileName = path.basename(filePath);

    try {
        const buffer = fs.readFileSync(filePath);

        const form = new FormData();
        form.append("file", buffer, { filename: fileName });

        const response = await fetch(API_URL, {
            method: "POST",
            body: form,
            headers: form.getHeaders()
        });

        if (!response.ok) {
            console.error(`[${type}] Failed for ${fileName}: ${response.statusText}`);
            return;
        }

        const result = await response.json(); // FullImageAuditResponse
        const predictedAI = result.isRejected;

        // Confusion matrix
        if (type === "ai") {
            if (predictedAI) TP++; else FN++;
        } else if (type === "real") {
            if (predictedAI) FP++; else TN++;
        }

        console.log(`[${type}] Uploaded ${fileName}, isRejected: ${predictedAI}, hasExif: ${result.details.metadata.hasExif}`);

        // Save to Supabase DB
        const { error } = await supabase
            .from("image_audit_results")
            .insert([{
                image_name: fileName,
                true_type: type,
                predicted_isRejected: predictedAI,
                riskScore: result.riskScore,
                hasExif: result.details.metadata.hasExif,
                label: result.label
            }]);

        if (error) {
            console.error(`[${type}] DB insert error for ${fileName}:`, error.message);
        }

    } catch (err) {
        console.error(`[${type}] Error uploading ${fileName}:`, err.message);
    }
};

const main = async () => {
    for (const folder of folders) {
        if (!fs.existsSync(folder.path)) {
            console.warn(`Folder does not exist: ${folder.path}, skipping.`);
            continue;
        }

        const files = fs.readdirSync(folder.path)
            .filter(file => /\.(jpg|jpeg|png)$/i.test(file));

        for (const file of files) {
            const filePath = path.join(folder.path, file);
            await uploadImage(filePath, folder.type);
        }
    }

    console.log("\n=== Confusion Matrix ===");
    console.log(`True Positive (AI correctly detected): ${TP}`);
    console.log(`True Negative (Real correctly detected): ${TN}`);
    console.log(`False Positive (Real incorrectly detected as AI): ${FP}`);
    console.log(`False Negative (AI incorrectly detected as Real): ${FN}`);

    const total = TP + TN + FP + FN;
    console.log(`Total images processed: ${total}`);
    const accuracy = ((TP + TN) / total) * 100;
    console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
};

main();