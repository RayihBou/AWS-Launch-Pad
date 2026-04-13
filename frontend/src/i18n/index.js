// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import en from './en.json';
import es from './es.json';
import pt from './pt.json';

const translations = { en, es, pt };

// Read language from build-time env var, default to English
export const language = import.meta.env.VITE_LANGUAGE || 'en';

const strings = translations[language] || translations.en;

// Resolve a dot-notation key (e.g. 'chat.placeholder') to its translated string
export function t(key) {
  return key.split('.').reduce((obj, k) => obj?.[k], strings) ?? key;
}
