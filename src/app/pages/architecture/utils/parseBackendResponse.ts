// Utility to parse backend response format and extract component quantities
// Backend format: { component_bom: [{ component_id, quantity }], actual_parts_bom: [...] }

export interface BackendComponentBOM {
  component_id: string;
  quantity: number;
}

export interface BackendActualPart {
  part_number?: string;
  pinout?: Record<string, { name: string; type: string; description: string }>;
  [key: string]: unknown;
}

export interface BackendResponse {
  component_bom?: BackendComponentBOM[];
  actual_parts_bom?: BackendActualPart[];
  [key: string]: unknown;
}

/**
 * Creates a map of component_id to quantity from backend response
 */
export function createQuantityMap(backendResponse: BackendResponse): Map<string, number> {
  const quantityMap = new Map<string, number>();
  
  if (backendResponse.component_bom && Array.isArray(backendResponse.component_bom)) {
    backendResponse.component_bom.forEach((item: BackendComponentBOM) => {
      quantityMap.set(item.component_id, item.quantity);
    });
  }
  
  return quantityMap;
}

/**
 * Gets quantity for a component based on partNumber (component_id)
 */
export function getComponentQuantity(
  partNumber: string,
  quantityMap: Map<string, number>
): number | undefined {
  return quantityMap.get(partNumber);
}

/**
 * Creates a map of part_number to pinout from backend response
 */
export function createPinoutMap(backendResponse: BackendResponse): Map<string, Record<string, { name: string; type: string; description: string }>> {
  const pinoutMap = new Map<string, Record<string, { name: string; type: string; description: string }>>();
  
  if (backendResponse.actual_parts_bom && Array.isArray(backendResponse.actual_parts_bom)) {
    backendResponse.actual_parts_bom.forEach((part) => {
      if (part.part_number && part.pinout) {
        pinoutMap.set(part.part_number, part.pinout);
      }
    });
  }
  
  return pinoutMap;
}

/**
 * Gets pinout for a component based on partNumber
 */
export function getComponentPinout(
  partNumber: string,
  pinoutMap: Map<string, Record<string, { name: string; type: string; description: string }>>
): Record<string, { name: string; type: string; description: string }> | undefined {
  return pinoutMap.get(partNumber);
}
