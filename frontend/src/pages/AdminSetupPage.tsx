import React, { useEffect, useState } from "react";
import { PlusCircle, CheckCircle2, AlertCircle, X, BedDouble, Building2 } from "lucide-react";
import type { IcuUnit, Bed } from "../types";
import { api } from "../api";

export const AdminSetupPage: React.FC = () => {
  const [units, setUnits] = useState<IcuUnit[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // New Unit Form
  const [newUnitName, setNewUnitName] = useState<string>("");
  const [newUnitCapacity, setNewUnitCapacity] = useState<number>(10);
  const [isSubmittingUnit, setIsSubmittingUnit] = useState<boolean>(false);

  // New Bed Form
  const [newBedNumber, setNewBedNumber] = useState<string>("");
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [isIsolation, setIsIsolation] = useState<boolean>(false);
  const [isSubmittingBed, setIsSubmittingBed] = useState<boolean>(false);

  async function loadData() {
    setIsLoading(true);
    setError("");
    try {
      const [unitsData, bedsData] = await Promise.all([api.getUnits(), api.getBeds()]);
      setUnits(unitsData);
      setBeds(bedsData);
      if (unitsData.length > 0 && !selectedUnitId) {
        setSelectedUnitId(unitsData[0]!.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load data";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreateUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!newUnitName.trim()) return;

    setIsSubmittingUnit(true);
    setError("");
    try {
      const res = await api.createUnit(newUnitName.trim(), newUnitCapacity);
      setSuccessMessage(res.message);
      setNewUnitName("");
      setNewUnitCapacity(10);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create unit";
      setError(msg);
    } finally {
      setIsSubmittingUnit(false);
    }
  }

  async function handleCreateBed(e: React.FormEvent) {
    e.preventDefault();
    if (!newBedNumber.trim() || !selectedUnitId) return;

    setIsSubmittingBed(true);
    setError("");
    try {
      const res = await api.createBed(newBedNumber.trim().toUpperCase(), selectedUnitId, isIsolation);
      setSuccessMessage(res.message);
      setNewBedNumber("");
      setIsIsolation(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create bed";
      setError(msg);
    } finally {
      setIsSubmittingBed(false);
    }
  }

  return (
    <div className="admin-setup-page">
      <div className="page-header">
        <div>
          <h2>Unit & Bed Configuration</h2>
          <p className="page-subtitle">Administrator-only controls for managing hospital wings and bed capacity</p>
        </div>
      </div>

      {successMessage && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
          <button type="button" className="close-banner-btn" onClick={() => setSuccessMessage("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" className="close-banner-btn" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {isLoading && <div className="loading-state">Loading ICU configuration...</div>}

      <div className="admin-grid">
        {/* Unit Setup Card */}
        <div className="admin-form-card">
          <div className="card-header-iconic">
            <Building2 size={20} className="header-icon" />
            <div>
              <h3>Add New ICU Unit</h3>
              <p>Configure a specialized department or wing</p>
            </div>
          </div>

          <form onSubmit={handleCreateUnit}>
            <div className="form-group">
              <label htmlFor="unitName">Unit Name *</label>
              <input
                id="unitName"
                type="text"
                required
                placeholder="e.g. Cardiac ICU (CICU) or Neuro ICU (NICU)"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="capacity">Bed Capacity *</label>
              <input
                id="capacity"
                type="number"
                min={1}
                max={100}
                required
                value={newUnitCapacity}
                onChange={(e) => setNewUnitCapacity(Number(e.target.value))}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={isSubmittingUnit}>
              <PlusCircle size={16} />
              <span>{isSubmittingUnit ? "Creating..." : "Create Unit"}</span>
            </button>
          </form>

          <div className="existing-units-list">
            <h4>Existing Units ({units.length})</h4>
            {units.map((u) => (
              <div key={u.id} className="unit-list-item">
                <strong>{u.name}</strong>
                <span>Capacity: {u.capacity} Beds</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bed Setup Card */}
        <div className="admin-form-card">
          <div className="card-header-iconic">
            <BedDouble size={20} className="header-icon" />
            <div>
              <h3>Add New Bed</h3>
              <p>Allocate a bed station to an ICU department</p>
            </div>
          </div>

          <form onSubmit={handleCreateBed}>
            <div className="form-group">
              <label htmlFor="targetUnit">Target ICU Unit *</label>
              <select
                id="targetUnit"
                required
                value={selectedUnitId || ""}
                onChange={(e) => setSelectedUnitId(Number(e.target.value))}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="bedNumber">Bed Number / Identifier *</label>
              <input
                id="bedNumber"
                type="text"
                required
                placeholder="e.g. MICU-13 or CICU-01"
                value={newBedNumber}
                onChange={(e) => setNewBedNumber(e.target.value)}
              />
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isIsolation}
                  onChange={(e) => setIsIsolation(e.target.checked)}
                />
                <span>Designate as Negative Pressure / Airborne Isolation Bed</span>
              </label>
            </div>

            <button type="submit" className="btn-primary" disabled={isSubmittingBed}>
              <PlusCircle size={16} />
              <span>{isSubmittingBed ? "Adding..." : "Add Bed"}</span>
            </button>
          </form>

          <div className="existing-units-list">
            <h4>Configured Beds ({beds.length} Total)</h4>
            <div className="admin-bed-chips">
              {beds.map((b) => (
                <span key={b.id} className={`chip-badge ${b.is_isolation ? "iso" : ""}`}>
                  {b.bed_number}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
