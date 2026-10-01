"use client";

import { useState } from "react";
import { TOPICS, type Topic } from "@/lib/knowledge";
import { Dropzone } from "./dropzone";

// Pick the topic first, then drop the files: each file is filed under it.
export function KnowledgeUpload({ initial }: { initial: Topic }) {
  const [topic, setTopic] = useState<Topic>(initial);
  return (
    <div className="kn-upload">
      <label className="ask-scope">
        <span>נושא</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>
          {Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <Dropzone topic={topic} compact label={`גרור לכאן מסמכים של "${TOPICS[topic]}"`} />
    </div>
  );
}
