import { returnTZ } from './timezones';

describe('timezones', () => {
  describe('returnTZ', () => {
    // Mock Math.random to control test outcomes
    let mockRandom: jest.SpyInstance;

    afterEach(() => {
      if (mockRandom) {
        mockRandom.mockRestore();
      }
    });

    describe('zone z3 (Australia/Pacific region)', () => {
      it('should return AU timezone when random < 0.75', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
        const result = returnTZ('z3');

        expect(result).toBeDefined();
        expect(result).toMatch(/^Australia\//);
      });

      it('should return NZ timezone when 0.75 <= random < 0.85', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.8);
        const result = returnTZ('z3');

        expect(result).toBeDefined();
        expect(result).toMatch(/^Pacific\//);
      });

      it('should return JP timezone when 0.85 <= random < 0.9', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.87);
        const result = returnTZ('z3');

        expect(result).toBeDefined();
        expect(result).toMatch(/^(Asia\/|Japan)/);
      });

      it('should return US timezone when 0.9 <= random < 0.95', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.92);
        const result = returnTZ('z3');

        expect(result).toBeDefined();
        expect(result).toMatch(/^(America\/|Pacific\/Honolulu|US\/)/);
      });

      it('should return SEA timezone when 0.95 <= random < 1', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.97);
        const result = returnTZ('z3');

        expect(result).toBeDefined();
        expect(result).toMatch(/^Asia\//);
      });
    });

    describe('zone z2 (Europe region)', () => {
      it('should return EU timezone when random < 0.95', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
        const result = returnTZ('z2');

        expect(result).toBeDefined();
        expect(result).toMatch(/^Europe\//);
      });

      it('should return US timezone when 0.95 <= random < 1', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.97);
        const result = returnTZ('z2');

        expect(result).toBeDefined();
        expect(result).toMatch(/^(America\/|Pacific\/Honolulu|US\/)/);
      });
    });

    describe('zone z1 (US region)', () => {
      it('should return US timezone when random < 0.85', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
        const result = returnTZ('z1');

        expect(result).toBeDefined();
        expect(result).toMatch(/^(America\/|Pacific\/Honolulu|US\/)/);
      });

      it('should return EU timezone when 0.85 <= random < 0.9', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.87);
        const result = returnTZ('z1');

        expect(result).toBeDefined();
        expect(result).toMatch(/^Europe\//);
      });

      it('should return SEA timezone when 0.9 <= random < 0.95', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.92);
        const result = returnTZ('z1');

        expect(result).toBeDefined();
        expect(result).toMatch(/^Asia\//);
      });

      it('should return AU timezone when 0.95 <= random < 1', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.97);
        const result = returnTZ('z1');

        expect(result).toBeDefined();
        expect(result).toMatch(/^Australia\//);
      });
    });

    describe('invalid zone', () => {
      it('should return undefined for unknown zone', () => {
        const result = returnTZ('z99');

        expect(result).toBeUndefined();
      });

      it('should return undefined for empty string', () => {
        const result = returnTZ('');

        expect(result).toBeUndefined();
      });

      it('should return undefined for invalid zone name', () => {
        const result = returnTZ('invalid');

        expect(result).toBeUndefined();
      });
    });

    describe('randomness verification', () => {
      it('should return different timezones on multiple calls (probabilistic)', () => {
        const results = new Set<string>();

        // Run multiple times to verify randomness
        for (let index = 0; index < 50; index++) {
          const result = returnTZ('z3');

          if (result) {
            results.add(result);
          }
        }

        // With 50 iterations, we should get at least 2 different timezones
        expect(results.size).toBeGreaterThanOrEqual(2);
      });

      it('should always return a valid timezone string for z1', () => {
        for (let index = 0; index < 20; index++) {
          const result = returnTZ('z1');

          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
        }
      });

      it('should always return a valid timezone string for z2', () => {
        for (let index = 0; index < 20; index++) {
          const result = returnTZ('z2');

          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
        }
      });

      it('should always return a valid timezone string for z3', () => {
        for (let index = 0; index < 20; index++) {
          const result = returnTZ('z3');

          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
        }
      });
    });

    describe('edge cases', () => {
      it('should handle random value at exact threshold boundaries for z3', () => {
        // Test exact boundary at 0.75
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.75);
        const result1 = returnTZ('z3');

        expect(result1).toBeDefined();

        // Test exact boundary at 0.85
        mockRandom.mockReturnValue(0.85);
        const result2 = returnTZ('z3');

        expect(result2).toBeDefined();

        // Test exact boundary at 0.9
        mockRandom.mockReturnValue(0.9);
        const result3 = returnTZ('z3');

        expect(result3).toBeDefined();

        // Test exact boundary at 0.95
        mockRandom.mockReturnValue(0.95);
        const result4 = returnTZ('z3');

        expect(result4).toBeDefined();
      });

      it('should handle random value at 0 (minimum)', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0);
        const result = returnTZ('z1');

        expect(result).toBeDefined();
        expect(result).toMatch(/^(America\/|Pacific\/Honolulu|US\/)/);
      });

      it('should handle random value close to 1 (maximum)', () => {
        mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.9999);
        const result = returnTZ('z1');

        expect(result).toBeDefined();
        expect(result).toMatch(/^Australia\//);
      });
    });
  });
});
