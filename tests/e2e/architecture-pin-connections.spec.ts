import { expect, type Locator, type Page, type Route, test } from '@playwright/test';

type MockConnection = {
  id: string;
  net_id: string | null;
  source_part: string;
  target_part: string | null;
  connection_type: string;
  signal_name?: string | null;
  reasoning?: string | null;
  confidence?: number | null;
  source_pin?: string | null;
  target_pin?: string | null;
  pin_confidence?: number | null;
  pin_reasoning?: string | null;
  pin_resolution_source?: string | null;
  user_corrected?: boolean | null;
};

type MockNet = {
  id: string;
  design_id: string;
  name: string;
  net_type: string;
  status: 'suggested' | 'confirmed' | 'rejected' | 'hidden' | 'ungrouped';
  layout?: Record<string, unknown> | null;
  member_connection_ids: string[];
  members: MockConnection[];
};

const designId = 'e2e-pin-persistence';

const pinouts = {
  LM317LCPK: {
    mpn: 'LM317LCPK',
    package: 'SOT-89',
    pin_count: 3,
    confidence: 0.98,
    pins: [
      {
        number: '1',
        name: 'ADJUST',
        direction: 'analog',
        function: 'Voltage adjust input',
        voltage_domain: null,
        logic_family: null,
        voltage_level: null,
        protocols: [],
        pull: null,
        notes: null,
      },
      {
        number: '2',
        name: 'OUTPUT',
        direction: 'output',
        function: 'Regulated output',
        voltage_domain: 'VOUT',
        logic_family: 'power',
        voltage_level: '3.3V',
        protocols: [],
        pull: null,
        notes: null,
      },
      {
        number: '3',
        name: 'INPUT',
        direction: 'power',
        function: 'Input supply',
        voltage_domain: 'VIN',
        logic_family: 'power',
        voltage_level: '5V',
        protocols: [],
        pull: null,
        notes: null,
      },
    ],
  },
  'TJA1051TK/3,118': {
    mpn: 'TJA1051TK/3,118',
    package: 'HVSON8',
    pin_count: 8,
    confidence: 0.97,
    pins: [
      {
        number: '1',
        name: 'TXD',
        direction: 'input',
        function: 'CAN transmit data input',
        voltage_domain: 'VIO',
        logic_family: 'cmos',
        voltage_level: '3.3V',
        protocols: ['CAN'],
        pull: null,
        notes: null,
      },
      {
        number: '2',
        name: 'GND',
        direction: 'ground',
        function: 'Ground',
        voltage_domain: 'GND',
        logic_family: 'power',
        voltage_level: '0V',
        protocols: [],
        pull: null,
        notes: null,
      },
      {
        number: '3',
        name: 'VCC',
        direction: 'power',
        function: 'Supply voltage',
        voltage_domain: 'VCC',
        logic_family: 'power',
        voltage_level: '5V',
        protocols: [],
        pull: null,
        notes: null,
      },
      {
        number: '4',
        name: 'RXD',
        direction: 'output',
        function: 'CAN receive data output',
        voltage_domain: 'VIO',
        logic_family: 'cmos',
        voltage_level: '3.3V',
        protocols: ['CAN'],
        pull: null,
        notes: null,
      },
    ],
  },
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installArchitectureApiMock(page: Page, connections: MockConnection[], nets: MockNet[] = []) {
  let nextConnectionNumber = 1;
  let nextNetNumber = 1;

  await page.route('http://localhost:8090/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET' && path === `/api/designs/${designId}`) {
      return fulfillJson(route, {
        id: designId,
        project_name: 'E2E Architecture',
        user_id: null,
        fsm_state: 'connections_pending_review',
        workflow_status: 'idle',
        current_stage: 8,
        created_at: '2026-05-27T00:00:00Z',
      });
    }

    if (method === 'GET' && path === `/api/designs/${designId}/connections`) {
      return fulfillJson(route, { connections });
    }

    if (method === 'POST' && path === `/api/designs/${designId}/connections`) {
      const body = request.postDataJSON() as Partial<MockConnection>;
      const created: MockConnection = {
        id: `manual-${nextConnectionNumber++}`,
        net_id: body.net_id ?? null,
        source_part: String(body.source_part),
        target_part: body.target_part ?? null,
        connection_type: String(body.connection_type || 'signal'),
        signal_name: body.signal_name ?? 'manual-link',
        reasoning: body.reasoning ?? null,
        confidence: body.confidence ?? null,
        source_pin: body.source_pin ?? null,
        target_pin: body.target_pin ?? null,
        pin_confidence: body.pin_confidence ?? null,
        pin_reasoning: body.pin_reasoning ?? null,
        pin_resolution_source: body.pin_resolution_source ?? 'manual',
        user_corrected: body.user_corrected ?? true,
      };
      connections.push(created);
      const net = created.net_id ? nets.find((candidate) => candidate.id === created.net_id) : null;
      if (net && !net.member_connection_ids.includes(created.id)) {
        net.member_connection_ids.push(created.id);
        net.members.push(created);
      }
      return fulfillJson(route, created, 201);
    }

    const deletePrefix = `/api/designs/${designId}/connections/`;
    if (method === 'PUT' && path.startsWith(deletePrefix)) {
      const connectionId = decodeURIComponent(path.slice(deletePrefix.length));
      const index = connections.findIndex((connection) => connection.id === connectionId);
      if (index === -1) {
        return fulfillJson(route, { detail: `Connection '${connectionId}' not found` }, 404);
      }
      const body = request.postDataJSON() as Partial<MockConnection>;
      connections[index] = { ...connections[index], ...body };
      return fulfillJson(route, connections[index]);
    }

    if (method === 'DELETE' && path.startsWith(deletePrefix)) {
      const connectionId = decodeURIComponent(path.slice(deletePrefix.length));
      const index = connections.findIndex((connection) => connection.id === connectionId);
      if (index !== -1) connections.splice(index, 1);
      for (const net of nets) {
        net.member_connection_ids = net.member_connection_ids.filter((id) => id !== connectionId);
        net.members = net.members.filter((member) => member.id !== connectionId);
      }
      return route.fulfill({ status: index === -1 ? 404 : 204 });
    }

    if (method === 'GET' && path === `/api/designs/${designId}/nets`) {
      return fulfillJson(route, { nets });
    }

    if (method === 'POST' && path === `/api/designs/${designId}/nets`) {
      const body = request.postDataJSON() as Partial<MockNet> & { layout?: Record<string, unknown> };
      const created: MockNet = {
        id: `net-${nextNetNumber++}`,
        design_id: designId,
        name: String(body.name || 'TESTNET'),
        net_type: String(body.net_type || 'signal'),
        status: body.status ?? 'confirmed',
        layout: body.layout ?? { x: 0, y: 0 },
        member_connection_ids: [],
        members: [],
      };
      nets.push(created);
      return fulfillJson(route, created, 201);
    }

    const netPrefix = `/api/designs/${designId}/nets/`;
    if (method === 'PUT' && path.startsWith(netPrefix) && path.endsWith('/layout')) {
      const netId = decodeURIComponent(path.slice(netPrefix.length, -'/layout'.length));
      const net = nets.find((candidate) => candidate.id === netId);
      if (!net) return fulfillJson(route, { detail: `Net '${netId}' not found` }, 404);
      const body = request.postDataJSON() as { layout?: Record<string, unknown> };
      net.layout = body.layout ?? {};
      return fulfillJson(route, net);
    }

    if (method === 'DELETE' && path.startsWith(netPrefix)) {
      const netId = decodeURIComponent(path.slice(netPrefix.length));
      const mode = url.searchParams.get('mode') || 'ungroup';
      const net = nets.find((candidate) => candidate.id === netId);
      if (!net) return fulfillJson(route, { detail: `Net '${netId}' not found` }, 404);
      const memberIds = new Set(net.member_connection_ids);
      for (const member of net.members) memberIds.add(member.id);
      if (mode === 'delete_links') {
        for (let index = connections.length - 1; index >= 0; index -= 1) {
          if (connections[index].net_id === netId || memberIds.has(connections[index].id)) {
            connections.splice(index, 1);
          }
        }
        net.status = 'rejected';
      } else {
        for (const connection of connections) {
          if (connection.net_id === netId || memberIds.has(connection.id)) connection.net_id = null;
        }
        net.status = 'ungrouped';
      }
      net.member_connection_ids = [];
      net.members = [];
      return fulfillJson(route, { ...net, deleted_member_count: memberIds.size });
    }

    if (method === 'GET' && path === `/api/designs/${designId}/classification`) {
      return fulfillJson(route, {
        parts: [],
        classification_map: {
          LM317LCPK: 'non-auxiliary',
          'TJA1051TK/3,118': 'non-auxiliary',
        },
      });
    }

    if (method === 'GET' && path === `/api/designs/${designId}/parts/specs`) {
      return fulfillJson(route, {
        LM317LCPK: {
          Category: 'LDO Voltage Regulators',
          Description: 'Adjustable linear voltage regulator',
          Manufacturer: 'Texas Instruments',
        },
        'TJA1051TK/3,118': {
          Category: 'CAN Transceivers',
          Description: 'High-speed CAN transceiver',
          Manufacturer: 'NXP Semiconductors',
        },
      });
    }

    if (method === 'GET' && path === `/api/designs/${designId}/parts/pinouts`) {
      return fulfillJson(route, {
        pinouts,
        missing: [],
      });
    }

    if (method === 'GET' && path === `/api/designs/${designId}/connections/review-status`) {
      return fulfillJson(route, { pending_review: false, workflow_id: null });
    }

    return fulfillJson(route, {});
  });
}

async function dragBetween(source: Locator, target: Locator, page: Page) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Pin handle was not measurable');

  const start = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const end = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 8 });
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

async function dragLocator(locator: Locator, page: Page, deltaX: number, deltaY: number) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Locator was not measurable');
  const start = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + deltaX / 2, start.y + deltaY / 2, { steps: 6 });
  await page.mouse.move(start.x + deltaX, start.y + deltaY, { steps: 6 });
  await page.mouse.up();
}

async function clickExposedPathPoint(path: Locator, page: Page) {
  await path.waitFor({ state: 'attached' });
  const point = await path.evaluate((element) => {
    const pathElement = element as SVGPathElement;
    const testId = pathElement.getAttribute('data-testid');
    const length = pathElement.getTotalLength();
    const screenPoint = pathElement.ownerSVGElement?.createSVGPoint();
    if (!screenPoint) {
      throw new Error('Edge path does not belong to an SVG element');
    }

    const toScreenPoint = (fraction: number) => {
      const pathPoint = pathElement.getPointAtLength(length * fraction);
      screenPoint.x = pathPoint.x;
      screenPoint.y = pathPoint.y;
      const transformed = screenPoint.matrixTransform(pathElement.getScreenCTM()!);
      return { x: transformed.x, y: transformed.y };
    };

    const fractions = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];
    for (const fraction of fractions) {
      const candidate = toScreenPoint(fraction);
      const hit = document.elementFromPoint(candidate.x, candidate.y);
      if (hit?.getAttribute('data-testid') === testId) {
        return candidate;
      }
    }

    return toScreenPoint(0.5);
  });

  await page.mouse.click(point.x, point.y);
}

test.describe('architecture pin connections', () => {
  test.use({ viewport: { width: 1600, height: 1100 } });

  test('manual pin-to-pin create persists after refresh and edge-editor delete persists after refresh', async ({ page }) => {
    const connections: MockConnection[] = [];
    const nets: MockNet[] = [];
    await installArchitectureApiMock(page, connections, nets);

    await page.goto(`/architecture?session=${designId}`);
    await expect(page.getByTestId('architecture-node-LM317LCPK')).toBeVisible();
    await expect(page.getByTestId('architecture-node-TJA1051TK/3,118')).toBeVisible();

    await page.getByTestId('architecture-node-LM317LCPK').getByRole('button', { name: /expand pinout/i }).click();
    await page.getByTestId('architecture-node-TJA1051TK/3,118').getByRole('button', { name: /expand pinout/i }).click();
    await page.getByTitle('Fit architecture').click();
    await page.waitForTimeout(350);

    const createResponse = page.waitForResponse((response) => (
      response.url() === `http://localhost:8090/api/designs/${designId}/connections` &&
      response.request().method() === 'POST'
    ));
    await dragBetween(
      page.getByTestId('pin-handle-LM317LCPK-2-source'),
      page.getByTestId('pin-handle-TJA1051TK/3,118-1-target'),
      page,
    );
    await createResponse;

    await expect.poll(() => connections.length).toBe(1);
    expect(connections[0]).toMatchObject({
      source_part: 'LM317LCPK',
      target_part: 'TJA1051TK/3,118',
      source_pin: 'OUTPUT',
      target_pin: 'TXD',
      pin_resolution_source: 'manual',
      user_corrected: true,
    });
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('architecture-node-LM317LCPK')).toContainText('1/3 active');
    await expect(page.getByTestId('architecture-node-TJA1051TK/3,118')).toContainText('1/4 active');
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(1);

    await clickExposedPathPoint(page.locator('[data-testid^="architecture-edge-manual-1"]'), page);
    await expect(page.getByText('Pin Mapping')).toBeVisible();

    const updateResponse = page.waitForResponse((response) => (
      response.url() === `http://localhost:8090/api/designs/${designId}/connections/manual-1` &&
      response.request().method() === 'PUT'
    ));
    await page.getByLabel('Target pin').selectOption('VCC');
    await updateResponse;
    expect(connections[0].target_pin).toBe('VCC');

    await clickExposedPathPoint(page.locator('[data-testid^="architecture-edge-manual-1"]'), page);
    await expect(page.getByText('Pin Mapping')).toBeVisible();

    const deleteResponse = page.waitForResponse((response) => (
      response.url() === `http://localhost:8090/api/designs/${designId}/connections/manual-1` &&
      response.request().method() === 'DELETE'
    ));
    await page.getByTestId('delete-pin-connection').click();
    await deleteResponse;

    await expect.poll(() => connections.length).toBe(0);
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('architecture-node-LM317LCPK')).toContainText('0/3 active');
    await expect(page.getByTestId('architecture-node-TJA1051TK/3,118')).toContainText('0/4 active');
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(0);

    const createNetResponse = page.waitForResponse((response) => (
      response.url() === `http://localhost:8090/api/designs/${designId}/nets` &&
      response.request().method() === 'POST'
    ));
    await page.getByPlaceholder('VBAT, 5V, CAN').fill('TESTNET');
    await page.getByRole('button', { name: /^Create$/ }).click();
    await createNetResponse;
    expect(nets).toHaveLength(1);

    await expect(page.getByText('Persisted net')).toBeVisible();
    await expect(page.getByText('TESTNET', { exact: true })).toBeVisible();
    const ungroupResponse = page.waitForResponse((response) => (
      response.url() === `http://localhost:8090/api/designs/${designId}/nets/net-1?mode=ungroup` &&
      response.request().method() === 'DELETE'
    ));
    await page.getByRole('button', { name: /^Ungroup$/ }).click();
    await ungroupResponse;
    expect(nets[0].status).toBe('ungrouped');

    await page.reload();
    await expect(page.locator('.react-flow__node-net', { hasText: 'TESTNET' })).toHaveCount(0);
  });

  test('persisted net delete-links removes member connections after refresh', async ({ page }) => {
    const connections: MockConnection[] = [{
      id: 'seed-1',
      net_id: 'net-delete',
      source_part: 'LM317LCPK',
      target_part: 'TJA1051TK/3,118',
      connection_type: 'signal',
      signal_name: 'DELETE_ME',
      source_pin: 'OUTPUT',
      target_pin: 'TXD',
      pin_resolution_source: 'manual',
      user_corrected: true,
    }];
    const nets: MockNet[] = [{
      id: 'net-delete',
      design_id: designId,
      name: 'DELETE_ME',
      net_type: 'signal',
      status: 'confirmed',
      layout: { x: 600, y: 240 },
      member_connection_ids: ['seed-1'],
      members: [connections[0]],
    }];
    await installArchitectureApiMock(page, connections, nets);

    await page.goto(`/architecture?session=${designId}`);
    const netNode = page.locator('.react-flow__node-net', { hasText: 'DELETE_ME' });
    await expect(netNode).toBeVisible();
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(2);

    await page.getByTitle('Move parts').click();
    const layoutResponse = page.waitForResponse((response) => (
      response.url() === `http://localhost:8090/api/designs/${designId}/nets/net-delete/layout` &&
      response.request().method() === 'PUT'
    ));
    await dragLocator(netNode, page, 90, 40);
    await layoutResponse;
    expect(nets[0].layout).toEqual(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
    }));

    await netNode.click();
    await expect(page.getByText('Member links', { exact: true })).toBeVisible();
    const deleteNetResponse = page.waitForResponse((response) => (
      response.url() === `http://localhost:8090/api/designs/${designId}/nets/net-delete?mode=delete_links` &&
      response.request().method() === 'DELETE'
    ));
    await page.getByRole('button', { name: /^Delete links$/ }).click();
    await deleteNetResponse;

    expect(connections).toHaveLength(0);
    expect(nets[0].status).toBe('rejected');

    await page.reload();
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(0);
    await expect(page.locator('.react-flow__node-net', { hasText: 'DELETE_ME' })).toHaveCount(0);
  });
});
