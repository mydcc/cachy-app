/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { z } from "zod";

// --- NewsAPI Schema ---
export const NewsApiArticleSchema = z.object({
  source: z.object({
    id: z.string().nullable().optional(),
    name: z.string().optional()
  }).optional(),
  author: z.string().nullable().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  url: z.string().optional(),
  urlToImage: z.string().nullable().optional(),
  publishedAt: z.string().optional(),
  content: z.string().nullable().optional()
}).passthrough();

export const NewsApiResponseSchema = z.object({
  status: z.string(),
  totalResults: z.number().optional(),
  articles: z.array(NewsApiArticleSchema).optional(),
  code: z.string().optional(),
  message: z.string().optional()
}).passthrough();

// --- CryptoPanic Schema ---
export const CryptoPanicPostSchema = z.object({
  kind: z.string().optional(),
  domain: z.string().optional(),
  source: z.object({
    title: z.string().optional(),
    region: z.string().optional(),
    domain: z.string().optional(),
    path: z.string().nullable().optional()
  }).optional(),
  title: z.string().optional(),
  published_at: z.string().optional(),
  slug: z.string().optional(),
  id: z.number().optional(),
  url: z.string().optional(),
  created_at: z.string().optional(),
  votes: z.object({
    negative: z.number().optional(),
    positive: z.number().optional(),
    important: z.number().optional(),
    liked: z.number().optional(),
    disliked: z.number().optional(),
    lol: z.number().optional(),
    toxic: z.number().optional(),
    saved: z.number().optional(),
    comments: z.number().optional()
  }).optional()
}).passthrough();

export const CryptoPanicResponseSchema = z.object({
  count: z.number().optional(),
  next: z.string().nullable().optional(),
  previous: z.string().nullable().optional(),
  results: z.array(CryptoPanicPostSchema).optional()
}).passthrough();
