// embeds.js

import { EmbedBuilder } from 'discord.js';

const EMOJI_REGEX = /[\p{Extended_Pictographic}\uFE0F]/gu;
const EMBED_FOOTER_SYMBOL = Symbol('luxeFooterText');
const EMBED_BASE_DESCRIPTION_SYMBOL = Symbol('luxeBaseDescription');

function sanitizeEmbedText(text = '') {
  if (typeof text !== 'string') return text;
  return text.replace(EMOJI_REGEX, '').replace(/[ \t]+/g, ' ').replace(/[ \t]\n/g, '\n').replace(/\n[ \t]/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sanitizeEmbedField(field) {
  if (!field || typeof field !== 'object') return field;
  return { ...field, name: sanitizeEmbedText(field.name), value: sanitizeEmbedText(field.value) };
}

const originalSetTitle = EmbedBuilder.prototype.setTitle;
const originalSetAuthor = EmbedBuilder.prototype.setAuthor;
const originalAddFields = EmbedBuilder.prototype.addFields;
const originalSetDescription = EmbedBuilder.prototype.setDescription;
const originalSetFooter = EmbedBuilder.prototype.setFooter;

EmbedBuilder.prototype.setTitle = function setSanitizedTitle(title) {
  return originalSetTitle.call(this, sanitizeEmbedText(title));
};

EmbedBuilder.prototype.setAuthor = function setSanitizedAuthor(author) {
  if (typeof author === 'string') return originalSetAuthor.call(this, sanitizeEmbedText(author));
  if (author && typeof author.name === 'string') return originalSetAuthor.call(this, { ...author, name: sanitizeEmbedText(author.name) });
  return originalSetAuthor.call(this, author);
};

EmbedBuilder.prototype.addFields = function addSanitizedFields(...fields) {
  const normalized = fields.flatMap((field) => (Array.isArray(field) ? field : [field]));
  return originalAddFields.call(this, normalized.map(sanitizeEmbedField));
};

EmbedBuilder.prototype.setDescription = function setSanitizedDescription(description = '') {
  const descString = sanitizeEmbedText(description || '');
  this[EMBED_BASE_DESCRIPTION_SYMBOL] = descString;
  return originalSetDescription.call(this, descString);
};

function normalizeFooterText(footer) {
  if (!footer) return '';
  if (typeof footer === 'string') return footer.trim();
  if (typeof footer.text === 'string') return footer.text.trim();
  return '';
}

function isImportantFooter(footerText) {
  return !!footerText && /\b(close|closes|closed|expire|expires|available in|page\s+\d+|dashboard closes|ticket id)\b/i.test(footerText);
}

EmbedBuilder.prototype.setFooter = function setFilteredFooter(footer) {
  const footerText = sanitizeEmbedText(normalizeFooterText(footer));
  if (!footerText || !isImportantFooter(footerText)) return this;
  this[EMBED_FOOTER_SYMBOL] = footerText;
  return originalSetFooter.call(this, { text: footerText });
};

// Luxe embeds never use Discord's coloured left-side strip.
EmbedBuilder.prototype.setColor = function setLuxeNoColorBar() {
  return this;
};

// Luxe embeds also omit Discord timestamps unless explicitly represented in the content.
EmbedBuilder.prototype.setTimestamp = function setLuxeNoTimestamp() {
  return this;
};

export function createEmbed({ title = '', description = '', color = null, fields = [], author = null, footer = null, thumbnail = null, image = null, timestamp = false, url = null } = {}) {
  const embed = new EmbedBuilder();
  if (title && typeof title === 'string') embed.setTitle(title.substring(0, 256));
  if (description && typeof description === 'string') embed.setDescription(description.substring(0, 4096));
  void color;

  if (Array.isArray(fields) && fields.length > 0) {
    const validFields = fields.filter((f) => f && f.name && f.value);
    if (validFields.length > 0) embed.addFields(validFields.slice(0, 25));
  }

  if (author) {
    try {
      if (typeof author === 'string' && author.length > 0) embed.setAuthor({ name: author.substring(0, 256) });
      else if (author && typeof author.name === 'string') embed.setAuthor(author);
    } catch {}
  }

  if (footer) {
    try {
      if (typeof footer === 'string' && footer.length > 0) embed.setFooter({ text: footer.substring(0, 2048) });
      else if (footer && typeof footer.text === 'string') embed.setFooter(footer);
    } catch {}
  }

  if (thumbnail) {
    try {
      if (typeof thumbnail === 'string' && thumbnail.length > 0) embed.setThumbnail(thumbnail);
      else if (thumbnail && typeof thumbnail.url === 'string') embed.setThumbnail(thumbnail.url);
    } catch {}
  }

  if (image) {
    try {
      if (typeof image === 'string' && image.length > 0) embed.setImage(image);
      else if (image && typeof image.url === 'string') embed.setImage(image.url);
    } catch {}
  }

  if (timestamp === true || timestamp instanceof Date) embed.setTimestamp();
  if (url && typeof url === 'string' && url.length > 0) {
    try { embed.setURL(url); } catch {}
  }
  return embed;
}

const NOTIFICATION_DEFAULT_TITLES = { success: 'Success', error: 'Error', info: 'Information', warning: 'Warning', primary: 'Notice' };

export const USER_ERROR_TITLES = {
  validation: 'Invalid Input', permission: 'Permission Denied', configuration: 'Configuration Error', database: 'Database Error', network: 'Network Error', discord_api: 'Discord API Error', user_input: 'Input Error', rate_limit: 'Too Fast', unknown: 'Something Went Wrong',
};

export function buildUserErrorEmbed(errorType, description = '', options = {}) {
  const type = errorType || 'unknown';
  const title = options.titleOverride || USER_ERROR_TITLES[type] || USER_ERROR_TITLES.unknown;
  const body = description ? String(description).trim() : undefined;
  return createEmbed({ title, description: body });
}

function containsDiscordRenderable(content = '') {
  return /<@!?&?\d+>|<#\d+>|\b\d{17,19}\b/.test(String(content));
}

function buildNotificationEmbed(title, body = '') {
  const defaultTitle = NOTIFICATION_DEFAULT_TITLES.primary;
  let titleText = String(title || '').trim();
  let bodyText = body ? String(body).trim() : '';
  if (titleText && containsDiscordRenderable(titleText)) {
    bodyText = bodyText ? `${titleText}\n\n${bodyText}` : titleText;
    titleText = defaultTitle;
  }
  return createEmbed({ title: titleText || defaultTitle, description: bodyText || undefined });
}

export function errorEmbed(title, detail = null, options = {}) {
  const { showDetails = process.env.NODE_ENV !== 'production' } = options;
  let body = detail;
  if (detail && showDetails && typeof detail !== 'string') body = formatCodeBlock(detail.message || String(detail));
  return buildUserErrorEmbed('unknown', body ? String(body).trim() : '', { titleOverride: title && title !== 'Error' ? title : undefined });
}

export function successEmbed(title, body = '') { return arguments.length === 1 ? buildNotificationEmbed('Success', title) : buildNotificationEmbed(title || 'Success', body); }
export function infoEmbed(title, body = '') { return arguments.length === 1 ? buildNotificationEmbed('Information', title) : buildNotificationEmbed(title || 'Information', body); }
export function warningEmbed(title, body = '') { return arguments.length === 1 ? buildNotificationEmbed('Warning', title) : buildNotificationEmbed(title || 'Warning', body); }

export const EMBED_SPACER = { name: '\u200B', value: '\u200B', inline: false };

export function formatUser(user) { return `${user} (${user.tag} | ${user.id})`; }
export function formatDate(date) { return `<t:${Math.floor(date.getTime() / 1000)}:F>`; }
export function formatRelativeTime(date) { return `<t:${Math.floor(date.getTime() / 1000)}:R>`; }
export function formatCodeBlock(content, language = '') { return `\`\`\`${language}\n${content}\n\`\`\``; }
export function formatInlineCode(content) { return `\`${content}\``; }
export function formatBold(content) { return `**${content}**`; }
export function formatItalic(content) { return `*${content}*`; }
export function formatUnderline(content) { return `__${content}__`; }
export function formatStrikethrough(content) { return `~~${content}~~`; }
export function formatSpoiler(content) { return `||${content}||`; }
export function formatQuote(content) { return `> ${content}`; }
export function formatList(items, ordered = false) { return items.map((item, index) => (ordered ? `${index + 1}.` : '•') + `${item}`).join('\n'); }
export function formatDuration(ms) {
  if (ms < 0) return '0s';
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000) % 24;
  const days = Math.floor(ms / 86400000);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join('');
}
export function formatProgressBar(current, max, size = 10) {
  const progress = Math.min(Math.max(0, current / max), 1);
  const filled = Math.round(size * progress);
  return `[${'█'.repeat(filled)}${'░'.repeat(size - filled)}] ${Math.round(progress * 100)}%`;
}
