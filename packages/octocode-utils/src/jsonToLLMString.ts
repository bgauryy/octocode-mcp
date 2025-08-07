/**
 * Clean Semantic Algorithm - Converts JSON to natural language format
 *
 * Step 1: Remove all JSON syntax (quotes, brackets, braces, commas)
 * Step 2: Create natural hierarchy with simple indentation
 * Step 3: Transform arrays into natural language patterns
 * Step 4: Use semantic labels (File:, Size:, Contents:, etc.)
 *
 * @param data - The JSON data to convert (object, array, or primitive).
 * @param indentation - The current indentation level for formatting.
 * @param maxDepth - Maximum recursion depth to prevent stack overflow.
 * @param visited - Set of visited objects to detect circular references.
 * @param parentKey - The parent key for context-aware labeling.
 * @returns The formatted string in natural language.
 */
export function jsonToLLMString(
  data: unknown,
  indentation: number = 0,
  maxDepth: number = 10,
  visited: Set<unknown> | null = null,
  parentKey: string = '',
  maxLength: number = 1000,
  maxArrayItems: number = 50
): string {
  // Initialize visited set for circular reference detection
  if (visited === null) {
    visited = new Set();
  }

  // Prevent infinite recursion
  if (indentation > maxDepth) {
    return '[Max depth reached]';
  }

  // Detect circular references
  if (typeof data === 'object' && data !== null) {
    if (visited.has(data)) {
      return '[Circular reference]';
    }
    visited.add(data);
  }

  // Define indentation string (2-4 spaces per level)
  const indent = ' '.repeat(indentation * 2);

  // Get semantic label based on key
  const getSemanticLabel = (key: string): string => {
    const labelMap: Record<string, string> = {
      // File/Content related
      path: 'File',
      size: 'Size',
      data: 'Contents',
      content: 'Content',
      text: 'Text',
      body: 'Body',
      message: 'Message',

      // Collection related
      items: 'Items',
      children: 'Subitems',
      files: 'Files',
      results: 'Results',
      matches: 'Matches',

      // Metadata
      type: 'Type',
      name: 'Name',
      value: 'Value',
      description: 'Description',
      title: 'Title',
      summary: 'Summary',

      // GitHub specific
      owner: 'Owner',
      repo: 'Repository',
      branch: 'Branch',
      commit: 'Commit',
      sha: 'SHA',
      author: 'Author',
      created: 'Created',
      updated: 'Updated',
      pushed: 'Last Pushed',
      stars: 'Stars',
      forks: 'Forks',
      language: 'Language',
      topics: 'Topics',
      license: 'License',

      // NPM specific
      version: 'Version',
      package: 'Package',
      dependencies: 'Dependencies',
      devdependencies: 'Dev Dependencies',
      scripts: 'Scripts',
      engines: 'Engines',
      keywords: 'Keywords',
      homepage: 'Homepage',
      repository: 'Repository',
      bugs: 'Bugs',
      maintainers: 'Maintainers',

      // Common data fields
      id: 'ID',
      url: 'URL',
      link: 'Link',
      email: 'Email',
      phone: 'Phone',
      address: 'Address',
      city: 'City',
      country: 'Country',
      date: 'Date',
      time: 'Time',
      timestamp: 'Timestamp',

      // Status/State
      status: 'Status',
      state: 'State',
      active: 'Active',
      enabled: 'Enabled',
      visible: 'Visible',
      public: 'Public',
      private: 'Private',

      // Counts/Statistics
      count: 'Count',
      total: 'Total',
      number: 'Number',
      amount: 'Amount',
      quantity: 'Quantity',
      score: 'Score',
      rating: 'Rating',

      // Error/Response related
      error: 'Error',
      warning: 'Warning',
      info: 'Info',
      debug: 'Debug',
      trace: 'Trace',
      stack: 'Stack',
    };
    const lowerKey = key.toLowerCase();
    return labelMap[lowerKey] || key.charAt(0).toUpperCase() + key.slice(1);
  };

  // Handle primitives - return without quotes or additional formatting
  if (data === null || typeof data !== 'object') {
    // Remove quotes from strings for natural language
    if (typeof data === 'string') {
      // Truncate long strings for token efficiency
      if (data.length > maxLength) {
        return data.substring(0, maxLength) + '... [truncated]';
      }
      return data;
    }
    // Handle booleans consistently with "yes"/"no"
    if (typeof data === 'boolean') {
      return data ? 'yes' : 'no';
    }
    // Handle null consistently with "none"
    if (data === null) {
      return 'none';
    }
    return String(data);
  }

  // Handle objects
  if (typeof data === 'object') {
    // Handle special object types first
    if (data instanceof Date) {
      return data.toISOString();
    }

    if (data instanceof RegExp) {
      return data.toString();
    }

    if (typeof data === 'function') {
      return data.toString();
    }

    // Handle arrays (moved here to avoid conflicts)
    if (Array.isArray(data)) {
      // Handle empty arrays
      if (data.length === 0) {
        return 'empty';
      }

      // Limit array items for token efficiency
      const displayItems = data.slice(0, maxArrayItems);
      const hasMore = data.length > maxArrayItems;

      // Check if it's an array of simple values or objects
      const isSimpleArray = displayItems.every(
        item => typeof item !== 'object' || item === null
      );

      if (isSimpleArray) {
        // Simple arrays: natural comma-separated list without brackets
        const result = displayItems
          .map(item => {
            if (typeof item === 'string') return item;
            if (typeof item === 'boolean') return item ? 'yes' : 'no';
            return String(item);
          })
          .join(', ');

        // Add truncation notice if needed
        return hasMore
          ? `${result}... [${data.length - maxArrayItems} more items]`
          : result;
      } else {
        // Arrays of objects: use numbered items or natural flow
        const result = displayItems
          .map((item, index) => {
            // For objects in arrays, format as natural items
            const itemStr = jsonToLLMString(
              item,
              indentation + 1,
              maxDepth,
              visited,
              parentKey,
              maxLength,
              maxArrayItems
            );
            // If it's a multi-line item, add proper indentation
            if (itemStr.includes('\n')) {
              return `${indent}Item ${index + 1}:\n${itemStr}`;
            }
            return `${indent}Item ${index + 1}: ${itemStr}`;
          })
          .join('\n');

        // Add truncation notice if needed
        return hasMore
          ? `${result}\n${indent}... [${data.length - maxArrayItems} more items]`
          : result;
      }
    }

    const keys = Object.keys(data as Record<string, unknown>);

    // Handle empty objects
    if (keys.length === 0) {
      return 'empty';
    }

    const lines = keys.map(key => {
      const value = (data as Record<string, unknown>)[key];
      const semanticLabel = getSemanticLabel(key);

      // Handle special object types in object properties
      if (value instanceof Date) {
        return `${indent}${semanticLabel}: ${value.toISOString()}`;
      }

      if (value instanceof RegExp) {
        return `${indent}${semanticLabel}: ${value.toString()}`;
      }

      if (typeof value === 'function') {
        return `${indent}${semanticLabel}: ${value.toString()}`;
      }

      // Check if the value is an object or array to handle nested formatting
      if (typeof value === 'object' && value !== null) {
        // Handle empty objects/arrays
        if (
          (Array.isArray(value) && value.length === 0) ||
          (typeof value === 'object' && Object.keys(value).length === 0)
        ) {
          return `${indent}${semanticLabel}: empty`;
        }

        // For nested structures, use semantic hierarchy with colons
        const nestedContent = jsonToLLMString(
          value,
          indentation + 1,
          maxDepth,
          visited,
          key,
          maxLength,
          maxArrayItems
        );

        // If the nested content is a single line, keep it inline
        if (!nestedContent.includes('\n')) {
          return `${indent}${semanticLabel}: ${nestedContent}`;
        }

        // For multi-line content, add newline for clarity
        return `${indent}${semanticLabel}:\n${nestedContent}`;
      } else {
        // Handle primitive values - clean natural language
        let displayValue: string;
        if (typeof value === 'string') {
          // Remove quotes, clean up values
          displayValue = value;
        } else if (value === null) {
          displayValue = 'none';
        } else if (typeof value === 'boolean') {
          displayValue = value ? 'yes' : 'no';
        } else {
          displayValue = String(value);
        }

        return `${indent}${semanticLabel}: ${displayValue}`;
      }
    });
    return lines.join('\n');
  }

  // Fallback for unexpected types
  return String(data);
}
