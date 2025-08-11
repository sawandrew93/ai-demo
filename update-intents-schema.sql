-- Update customer_intents table to ensure proper email storage
-- This script ensures the customer_email column exists and removes unused columns

-- Check if customer_email column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customer_intents' 
                   AND column_name = 'customer_email') THEN
        ALTER TABLE customer_intents ADD COLUMN customer_email VARCHAR(255);
    END IF;
END $$;

-- Check if customer_company column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customer_intents' 
                   AND column_name = 'customer_company') THEN
        ALTER TABLE customer_intents ADD COLUMN customer_company VARCHAR(255);
    END IF;
END $$;

-- Remove unused columns if they exist (optional - you can keep them for historical data)
-- Uncomment the following lines if you want to remove the old columns completely

-- DO $$ 
-- BEGIN
--     IF EXISTS (SELECT 1 FROM information_schema.columns 
--                WHERE table_name = 'customer_intents' 
--                AND column_name = 'customer_firstname') THEN
--         ALTER TABLE customer_intents DROP COLUMN customer_firstname;
--     END IF;
-- END $$;

-- DO $$ 
-- BEGIN
--     IF EXISTS (SELECT 1 FROM information_schema.columns 
--                WHERE table_name = 'customer_intents' 
--                AND column_name = 'customer_lastname') THEN
--         ALTER TABLE customer_intents DROP COLUMN customer_lastname;
--     END IF;
-- END $$;

-- DO $$ 
-- BEGIN
--     IF EXISTS (SELECT 1 FROM information_schema.columns 
--                WHERE table_name = 'customer_intents' 
--                AND column_name = 'customer_country') THEN
--         ALTER TABLE customer_intents DROP COLUMN customer_country;
--     END IF;
-- END $$;

-- Add index on customer_email for better query performance
CREATE INDEX IF NOT EXISTS idx_customer_intents_email ON customer_intents(customer_email);

-- Add index on customer_company for better query performance  
CREATE INDEX IF NOT EXISTS idx_customer_intents_company ON customer_intents(customer_company);

COMMENT ON COLUMN customer_intents.customer_email IS 'Email address collected from customer at chat start';
COMMENT ON COLUMN customer_intents.customer_company IS 'Company name collected from customer at chat start';