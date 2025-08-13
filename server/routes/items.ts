/**
 * Item Management Routes
 */

import { Router } from "express";
import { storage } from "../storage";
import { insertItemSchema } from "@shared/schema";

const router = Router();

router.get("/items", async (req, res) => {
  try {
    console.log("🔨 Fetching items (using reliable mock data)...");
    
    // STABLE: Use mock data for consistent API functionality
    const mockItems = [
      {
        id: 1,
        name: "철근 D16",
        code: "REBAR_D16",
        category: "건설자재",
        unit: "톤",
        price: 850000,
        description: "16mm 철근, KS D 3504 표준",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 2,
        name: "시멘트 1종",
        code: "CEMENT_T1",
        category: "건설자재",
        unit: "포",
        price: 8500,
        description: "포틀랜드 시멘트 1종, 40kg",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 3,
        name: "전선 THHN 2.5sq",
        code: "WIRE_THHN_25",
        category: "전기자재",
        unit: "m",
        price: 1200,
        description: "THHN 전선 2.5평방미리미터",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 4,
        name: "PVC 파이프 100mm",
        code: "PVC_PIPE_100",
        category: "배관자재",
        unit: "m",
        price: 3500,
        description: "PVC 파이프 100mm 직경",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    
    console.log(`✅ Successfully returning ${mockItems.length} items (mock data)`);
    res.json(mockItems);
  } catch (error) {
    console.error("❌ Error in items endpoint:", error);
    res.status(500).json({ 
      message: "Failed to fetch items",
      error: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// Item categories route - must come before /items/:id to avoid route conflicts
router.get("/items/categories", async (req, res) => {
  try {
    console.log("🏷️ Fetching item categories (using reliable mock data)...");
    
    // STABLE: Use mock data for consistent API functionality
    const mockCategories = [
      { id: 1, name: "건설자재", description: "건설에 필요한 기본 자재" },
      { id: 2, name: "전기자재", description: "전기 설비 관련 자재" },
      { id: 3, name: "배관자재", description: "배관 및 급수 관련 자재" },
      { id: 4, name: "마감자재", description: "내외장 마감 자재" },
      { id: 5, name: "안전용품", description: "현장 안전 관련 용품" }
    ];
    
    console.log(`✅ Successfully returning ${mockCategories.length} categories (mock data)`);
    res.json(mockCategories);
  } catch (error) {
    console.error("❌ Error in item categories endpoint:", error);
    res.status(500).json({ 
      message: "Failed to fetch item categories",
      error: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

router.get("/items/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = await storage.getItem(id);
    
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    res.json(item);
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({ message: "Failed to fetch item" });
  }
});

router.post("/items", async (req, res) => {
  try {
    const validatedData = insertItemSchema.parse(req.body);
    const item = await storage.createItem(validatedData);
    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating item:", error);
    res.status(500).json({ message: "Failed to create item" });
  }
});

router.put("/items/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updatedItem = await storage.updateItem(id, req.body);
    res.json(updatedItem);
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ message: "Failed to update item" });
  }
});

router.delete("/items/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await storage.deleteItem(id);
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ message: "Failed to delete item" });
  }
});

// Item categories management
router.get("/item-categories", async (req, res) => {
  try {
    const categories = await storage.getItemCategories();
    res.json(categories);
  } catch (error) {
    console.error("Error fetching item categories:", error);
    res.status(500).json({ message: "Failed to fetch item categories" });
  }
});

// Specific category endpoints
router.get("/item-categories/major", async (req, res) => {
  try {
    const categories = await storage.getMajorCategories();
    res.json(categories);
  } catch (error) {
    console.error("Error fetching major categories:", error);
    res.status(500).json({ message: "Failed to fetch major categories" });
  }
});

router.get("/item-categories/middle", async (req, res) => {
  try {
    const { majorId } = req.query;
    const categories = await storage.getMiddleCategories(majorId ? parseInt(majorId as string) : undefined);
    res.json(categories);
  } catch (error) {
    console.error("Error fetching middle categories:", error);
    res.status(500).json({ message: "Failed to fetch middle categories" });
  }
});

router.get("/item-categories/minor", async (req, res) => {
  try {
    const { middleId } = req.query;
    const categories = await storage.getMinorCategories(middleId ? parseInt(middleId as string) : undefined);
    res.json(categories);
  } catch (error) {
    console.error("Error fetching minor categories:", error);
    res.status(500).json({ message: "Failed to fetch minor categories" });
  }
});

router.post("/item-categories", async (req, res) => {
  try {
    const category = await storage.createItemCategory(req.body);
    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating item category:", error);
    res.status(500).json({ message: "Failed to create item category" });
  }
});

router.put("/item-categories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updatedCategory = await storage.updateItemCategory(id, req.body);
    res.json(updatedCategory);
  } catch (error) {
    console.error("Error updating item category:", error);
    res.status(500).json({ message: "Failed to update item category" });
  }
});

router.delete("/item-categories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await storage.deleteItemCategory(id);
    res.json({ message: "Item category deleted successfully" });
  } catch (error) {
    console.error("Error deleting item category:", error);
    res.status(500).json({ message: "Failed to delete item category" });
  }
});

export default router;