# Insurance EDW Data Quality Monitor & Actuarial Reporting Dashboard

A production-style web application simulating an Enterprise Data Warehouse workflow for insurance actuarial data management. The project covers the full lifecycle of insurance policy data — from platform ingestion through quality validation to executive reporting.

## Overview

Insurance companies receive policy data from multiple source platforms simultaneously. Before that data can be used for reserve calculations, lapse rate modeling, or regulatory reporting, it needs to be ingested, validated, and stored in a standardized format. This application simulates that end-to-end process across a portfolio of 120 synthetic insurance policies spanning life, annuity, Medicare Supplement, and Accident & Health product lines.

## Features

**KPI Dashboard**
Live actuarial metrics including total in-force policies, annual premium volume, lapse rate, and product mix. Visualizes premium trends over time, policy status distribution, and ingestion volume by source platform. Clicking any policy record in the table opens a full field-level detail panel with data quality flags highlighted inline.

**Data Quality Engine**
Automated quality control system that evaluates every policy record across six rule categories: null checks, range validation, referential integrity, and business rules. Produces an overall data quality score, flags individual issues by severity (Critical / Warning), and breaks down problem rates by field so analysts can prioritize remediation.

**Data Ingestion Simulator**
Models the process of onboarding a new insurance platform into the EDW. Includes field mapping from source system nomenclature to standardized EDW schema, S3 source path configuration, and a step-by-step pipeline execution log covering extraction, transformation, pre-load quality checks, and final load to the target table.

**Data Dictionary**
Searchable metadata repository documenting every field in the POLICY_MASTER table. Each entry includes data type, nullability, PII classification, business rules, source system lineage, and data ownership — the foundation of any governed enterprise data environment.

## Tech Stack

React 18, Vite, Recharts, IBM Plex Sans, Tabler Icons
