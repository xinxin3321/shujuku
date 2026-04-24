import { getHostRequestHeaders_ACU } from './ai-gateway';

export interface VectorEmbeddingResult_ACU {
    index: number;
    embedding: number[];
}

export interface VectorEmbeddingRequest_ACU {
    endpoint: string;
    apiKey?: string;
    model: string;
    input: string[];
}

function normalizeEndpoint_ACU(endpoint: string): string {
    return String(endpoint || '').trim().replace(/\/+$/, '');
}

function buildEmbeddingHeaders_ACU(apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
        ...getHostRequestHeaders_ACU(),
        'Content-Type': 'application/json',
    };
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
}

function normalizeEmbeddingArray_ACU(value: any): number[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));
}

export async function createEmbeddings_ACU(request: VectorEmbeddingRequest_ACU): Promise<VectorEmbeddingResult_ACU[]> {
    const endpoint = normalizeEndpoint_ACU(request.endpoint);
    const input = Array.isArray(request.input)
        ? request.input.map((item) => String(item ?? '')).filter((item) => item.trim())
        : [];

    if (!endpoint) {
        throw new Error('Embedding endpoint 为空。');
    }
    if (!request.model || !String(request.model).trim()) {
        throw new Error('Embedding model 为空。');
    }
    if (input.length === 0) {
        return [];
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: buildEmbeddingHeaders_ACU(request.apiKey),
        body: JSON.stringify({
            model: String(request.model).trim(),
            input,
        }),
    });

    if (!response.ok) {
        throw new Error(`Embedding 请求失败: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const data = Array.isArray(payload?.data) ? payload.data : [];

    return data.map((item: any, index: number) => ({
        index: Number.isFinite(Number(item?.index)) ? Number(item.index) : index,
        embedding: normalizeEmbeddingArray_ACU(item?.embedding),
    }));
}
